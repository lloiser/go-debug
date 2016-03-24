"use babel";

import { CompositeDisposable } from "atom";
import * as path from "path";
import { store, indexOfBreakpoint, getBreakpoints } from "./store";
import * as Delve from "./delve";

let editors = {};
let subscriptions = new CompositeDisposable();

store.subscribe(() => {
	updateBreakpoints();

	// open the file of the selected stacktrace and highlight the current line
	const state = store.getState();
	openAndHighlight(state.delve.stacktrace[state.delve.selectedStacktrace]);
});

subscriptions.add(
	atom.workspace.observeTextEditors((editor) => {
		const grammar = editor.getGrammar();
		if (grammar.scopeName !== "source.go") {
			return;
		}
		const file = path.normalize(editor.getPath());
		if (editors[file]) {
			updateBreakpoints(file);
			return;
		}

		editors[file] = {
			instance: editor,
			breakpoints: {}, // contains the breakpoint markers
			gutter: editor.addGutter({ name: "go-debug", priority: -100 })
		};

		updateBreakpoints(file);

		const gutterView = atom.views.getView(editors[file].gutter);
		gutterView.addEventListener("click", onGutterClick.bind(null, editors[file]));
	}),
	atom.workspace.onWillDestroyPaneItem(({ item: editor }) => {
		const file = editor && editor.getPath && editor.getPath();
		if (file) {
			destroyEditor(file);
			delete editors[file];
		}
	})
);

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

function updateBreakpoints(file) {
	const bps = getBreakpoints(file);

	// update and add breakpoints
	bps.forEach((bp) => updateBreakpoint(bp.file, bp.line, bp));

	// remove remaining
	const removeFromEditor = (file) => {
		const editorBps = editors[file] && editors[file].breakpoints;
		if (editorBps) {
			Object.keys(editorBps).forEach((line) => {
				if (indexOfBreakpoint(bps, file, +line) === -1) {
					updateBreakpoint(file, +line);
				}
			});
		}
	};
	if (file) {
		removeFromEditor(file);
	} else {
		Object.keys(editors).forEach(removeFromEditor);
	}
}

function updateBreakpoint(file, line, bp) {
	const editor = editors[file];
	if (!editor) {
		return; // editor not visible, nothing to show
	}

	const deco = editor.breakpoints[line];
	if (!bp) {
		if (deco) {
			deco.getMarker().destroy();
		}
		delete editor.breakpoints[line];
		return;
	}

	const el = document.createElement("div");
	el.className = "go-debug-breakpoint go-debug-breakpoint-state-" + bp.state;
	el.dataset.state = bp.state;
	el.title = bp.message || "";
	const decoration = {
		class: "go-debug-gutter-breakpoint",
		item: el
	};

	if (!deco) {
		// create a new decoration
		const marker = editor.instance.markBufferPosition({ row: line });
		editor.breakpoints[line] = editor.gutter.decorateMarker(marker, decoration);
	} else {
		// update an existing decoration
		const newProps = Object.assign(
			{},
			deco.getProperties(),
			decoration
		);
		deco.setProperties(newProps);
	}
}

export function destroy() {
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
	Object.keys(editor.breakpoints).forEach((line) => {
		editor.breakpoints[line].getMarker().destroy();
	});
}

function onGutterClick(editor, ev) {
	const editorView = atom.views.getView(editor.instance);
	const { row: line } = editorView.component.screenPositionForMouseEvent(ev);

	// TODO: conditions via right click menu?

	const file = editor.instance.getPath();
	if (editor.breakpoints[line]) {
		Delve.removeBreakpoint(file, line);
		return;
	}

	Delve.addBreakpoint(file, line);
}
