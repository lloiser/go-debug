"use babel";

import { CompositeDisposable } from "atom";
import * as path from "path";
import { store, indexOfBreakpoint, getBreakpoints } from "./store";
import * as Delve from "./delve";
import { debounce } from "./utils";

let editors = {};

function observeTextEditors(editor) {
	const grammar = editor.getGrammar();
	if (grammar.scopeName !== "source.go") {
		return;
	}
	const file = path.normalize(editor.getPath());
	if (editors[file]) {
		updateMarkers(file);
		return;
	}

	editors[file] = {
		instance: editor,
		markers: [], // contains the breakpoint markers
		gutter: editor.addGutter({ name: "go-debug", priority: -100 })
	};

	updateMarkers(file);

	const gutterView = atom.views.getView(editors[file].gutter);
	gutterView.addEventListener("click", onGutterClick.bind(null, editors[file]));
}

function onWillDestroyPaneItem({ item: editor }) {
	const file = editor && editor.getPath && editor.getPath();
	if (file) {
		destroyEditor(file);
		delete editors[file];
	}
}

let lastStackPC;

let lineMarker;
const removeLineMarker = () => lineMarker && lineMarker.destroy();

function openAndHighlight(stack) {

	if (!stack) {
		// finished or just started -> no line marker visible
		removeLineMarker();
		lastStackPC = 0;
		return;
	}

	if (stack.pc === lastStackPC) {
		return;
	}
	lastStackPC = stack.pc;

	// remove any previous line marker
	removeLineMarker();

	// open the file
	const line = stack.line - 1; // dlv = 1 indexed line / atom = 0 indexed line
	atom.workspace.open(stack.file, { initialLine: line, searchAllPanes: true }).then(() => {
		// create a new marker
		const editor = atom.workspace.getActiveTextEditor();
		lineMarker = editor.markBufferPosition({ row: line });
		editor.decorateMarker(lineMarker, { type: "line", class: "go-debug-debug-line" });

		// center the line
		editor.scrollToBufferPosition([line, 0], { center: true });
	});
}

function updateMarkers(file) {
	const bps = getBreakpoints(file);

	// update and add markers
	bps.forEach((bp) => updateMarker(bp.file, bp.line, bp));

	// remove remaining
	const removeFromEditor = (file) => {
		const editorBps = editors[file] && editors[file].markers || [];
		editorBps.forEach(({ line }) => {
			if (indexOfBreakpoint(bps, file, line) === -1) {
				updateMarker(file, line);
			}
		});
	};
	if (file) {
		removeFromEditor(file);
	} else {
		Object.keys(editors).forEach(removeFromEditor);
	}
}

function updateMarker(file, line, bp) {
	const editor = editors[file];
	if (!editor) {
		return; // editor not visible, nothing to show
	}

	const index = editor.markers.findIndex(({ line: l }) => l === line);
	const marker = editor.markers[index];
	if (!bp) {
		if (marker) {
			marker.decoration.getMarker().destroy();
		}
		editor.markers.splice(index, 1);
		return;
	}

	const el = document.createElement("div");
	el.className = "go-debug-breakpoint go-debug-breakpoint-state-" + bp.state;
	el.dataset.state = bp.state;
	el.title = bp.message || ""; // TODO: add texts for other breakpoint states
	const decoration = {
		class: "go-debug-gutter-breakpoint",
		item: el
	};

	if (!marker) {
		// create a new decoration
		const marker = editor.instance.markBufferPosition({ row: line });
		marker.onDidChange(debounce(onMarkerDidChange.bind(null, { file, line, marker }), 50));
		editor.markers.push({
			marker, line, bp,
			decoration: editor.gutter.decorateMarker(marker, decoration)
		});
	} else {
		// check if the breakpoint has even changed
		if (marker.bp === bp) {
			return;
		}
		marker.bp = bp;

		// update an existing decoration
		marker.decoration.setProperties(Object.assign(
			{},
			marker.decoration.getProperties(),
			decoration
		));
	}
}

function onMarkerDidChange({ file, line, marker }, event) {
	if (!event.isValid) {
		// marker is not valid anymore - text at marker got
		// replaced or was removed -> remove the breakpoint
		Delve.removeBreakpoint(file, line);
		return;
	}

	Delve.updateBreakpointLine(file, line, marker.getStartBufferPosition().row);
}

const debouncedStoreChange = debounce(() => {
	updateMarkers();

	// open the file of the selected stacktrace and highlight the current line
	const state = store.getState();
	openAndHighlight(state.delve.stacktrace[state.delve.selectedStacktrace]);
}, 50);

let subscriptions;
export function init() {
	subscriptions = new CompositeDisposable(
		atom.workspace.observeTextEditors(observeTextEditors),
		atom.workspace.onWillDestroyPaneItem(onWillDestroyPaneItem),
		{ dispose: store.subscribe(debouncedStoreChange) }
	);
}
export function dispose() {
	Object.keys(editors).forEach(destroyEditor);
	editors = {};

	removeLineMarker();
	lineMarker = null;

	subscriptions.dispose();
	subscriptions = null;
}

function destroyEditor(file) {
	const editor = editors[file];
	if (!editor) {
		return;
	}

	editor.gutter.destroy();

	// remove all breakpoint decorations (marker)
	editor.markers.forEach((bp) => bp.decoration.getMarker().destroy());
}

function onGutterClick(editor, ev) {
	const editorView = atom.views.getView(editor.instance);
	const { row: line } = editorView.component.screenPositionForMouseEvent(ev);

	// TODO: conditions via right click menu?

	const file = editor.instance.getPath();
	const deco = editor.markers.find(({ line: l }) => l === line);
	if (deco) {
		Delve.removeBreakpoint(file, line);
		return;
	}

	Delve.addBreakpoint(file, line);
}
