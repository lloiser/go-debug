"use babel";

// This component manages the communication between delve, panel and editors.

import { CompositeDisposable } from "atom";
import * as path from "path";
import interact from "interact.js";

import Delve from "./delve";
import Editor from "./editor";
import Panel from "./panel";
import { createElement, catcher } from "./utils";

export default class Controller {
	constructor(state) {
		this.delve = null;

		this.editors = [];
		this.editorsState = state.editors || {};

		this.selectedStacktraceIndex = 0;

		this.initPanel(state.panel);

		this.subscriptions = new CompositeDisposable();
		this.subscriptions.add(
			atom.commands.add("atom-workspace", {
				"go-debug:run": () => this.run(),
				"go-debug:restart": () => this.command("restart"),
				"go-debug:continue": () => this.command("continue"),
				"go-debug:next": () => this.command("next"),
				"go-debug:step": () => this.command("step")
			}),
			atom.workspace.onDidChangeActivePaneItem(this._onAtomDidChangeActivePaneItem.bind(this)),
			atom.workspace.observeTextEditors(this._onAtomObserveTextEditors.bind(this)),
			atom.workspace.onWillDestroyPaneItem(this._onAtomWilDestroyEditor.bind(this))
		);
	}

	initPanel(state = {}) {
		// debugger panel used to display details like variables, stacktrace, step/next/... buttons, ...
		const el = createElement("div", ["go-debug-panel"]);
		this.panel = new Panel(el);
		this.panel.onDidSelectStacktrace(this.setSelectedStacktraceIndex.bind(this));
		this.atomPanel = atom.workspace.addBottomPanel({ item: el });

		// allow resizing of the panel
		el.style.height = `${state.height}px`;
		interact(el).resizable({ edges: { top: true } }).on("resizemove", (event) => {
			event.target.style.height = `${event.rect.height}px`;
		});
	}

	// atom API

	serialize() {
		const editors = this.updateEditorState();

		const panel = {
			height: this.panel.element.getBoundingClientRect().height
		};

		return { panel, editors };
	}

	destroy() {
		if (this.delve) {
			this.delve.destroy();
		}
		this.editors.forEach((e) => e.destroy());
		this.panel.destroy();
		this.subscriptions.dispose();
	}

	updateEditorState() {
		this.editors.forEach((e) => {
			this.editorsState[e.editor.getPath()] = e.serialize();
		});
		return this.editorsState;
	}

	togglePanel(editor) {
		const grammar = editor.getGrammar();
		if (grammar.scopeName !== "source.go") {
			this.atomPanel.hide();
		} else {
			this.atomPanel.show();
		}
	}

	setSelectedStacktraceIndex(index) {
		this.selectedStacktraceIndex = index;

		// update everything
		const stacktrace = this.delve ? this.delve.stacktrace : [];
		const stack = stacktrace[this.selectedStacktraceIndex];
		const variables = stack ? stack.Arguments.concat(stack.Locals) : [];

		this.panel.renderStacktrace(stacktrace, this.selectedStacktraceIndex);
		this.panel.renderVariables(variables);
		this.updateDebugLine();
	}

	updateDebugLine() {
		// remove a previous decoration
		if (this.debugLineMarker) {
			this.debugLineMarker.destroy();
		}

		const stack = this.delve && this.delve.stacktrace[this.selectedStacktraceIndex];
		if (!stack) {
			return;
		}

		const line = stack.line - 1; // dlv = 1 indexed line - atom = 0 indexed line

		// open the file
		atom.workspace.open(stack.file, { initialLine: line, searchAllPanes: true }).then(() => {
			// update the marker
			const editor = atom.workspace.getActiveTextEditor();
			this.debugLineMarker = editor.markBufferPosition({ row: line });
			editor.decorateMarker(this.debugLineMarker, { type: "line", class: "go-debug-debug-line" });
			// center the line
			editor.scrollToBufferPosition([line, 0], { center: true });
		}).catch(catcher);
	}

	run() {
		const editor = atom.workspace.getActiveTextEditor();
		const file = editor.getPath();

		let fn;
		// test file?
		if (file.endsWith("_test.go")) {
			fn = "runPackageTests";
		} else {
			// file with main?
			const text = editor.getText();
			const matches = text.match(/^func main\(\) \{/gm);
			if (matches && matches.length > 0) {
				fn = "runPackage";
			} else {
				// TODO: ask the user how to start delve
			}
		}

		Delve[fn](file).then((delve) => {
			this.delve = delve;
			this.delve.onDidFinish(this._onDelveDidFinish.bind(this));

			const editors = this.updateEditorState();
			Object.keys(editors).forEach((file) => {
				(editors[file].breakpoints || []).forEach((line) => {
					this.createBreakpoint({ file, line: line });
				});
			});
		}).catch(catcher);
	}

	command(fn) {
		if (!this.delve) {
			return;
		}

		this.delve[fn]().then(() => {
			this.setSelectedStacktraceIndex(0);
		}).catch(catcher);
	}

	createBreakpoint({ file, line }) {
		if (!this.delve) {
			return;
		}

		this.delve.createBreakpoint(file, line).then(() => {
			const editor = this.findEditor(file);
			if (!editor) {
				return;
			}

			editor.updateBreakpoint(line, Editor.breakpointStates.active);
		}).catch(catcher);
	}

	clearBreakpoint({ file, line }) {
		if (!this.delve) {
			return;
		}

		this.delve.clearBreakpoint(file, line).catch(catcher);
	}

	findEditor(file) {
		if (!file) {
			return null;
		}
		file = path.normalize(file);
		return this.editors.find((e) => e.editor.getPath() === file);
	}

	// atom events

	_onAtomObserveTextEditors(editor) {
		this.togglePanel(editor);

		const grammar = editor.getGrammar();
		if (grammar.scopeName !== "source.go") {
			return;
		}

		const file = editor.getPath();
		let e = this.findEditor(file);
		if (e) {
			return;
		}

		e = new Editor(editor);
		this.editors.push(e);
		e.onDidCreateBreakpoint(this.createBreakpoint.bind(this));
		e.onDidClearBreakpoint(this.clearBreakpoint.bind(this));

		const { delve } = this;

		// revive all breakpoints with inactive state
		const state = this.editorsState[file] || {};
		const { breakpoints } = state;
		if (breakpoints) {
			breakpoints.forEach((line) => {
				let state = Editor.breakpointStates.inactive;
				if (delve && delve.breakpointAt(file, line)) {
					state = Editor.breakpointStates.active;
				}
				e.updateBreakpoint(line, state);
			});
		}

		// update the debug line if the file of the current stacktrace is opened
		if (delve) {
			const stack = this.delve.stacktrace[this.selectedStacktraceIndex];
			if (stack && path.normalize(stack.file) === file) {
				// this.updateDebugLine();
			}
		}
	}

	_onAtomWilDestroyEditor({ item }) {
		const file = item && item.getPath && item.getPath();
		const e = this.findEditor(file);
		if (!e) {
			return;
		}

		const index = this.editors.indexOf(e);
		this.editors.splice(index, 1);

		e.destroy();

		// serialize all breakpoints to apply them once the file is opened again
		const state = e.serialize();
		this.editorsState[file] = state;
	}

	_onAtomDidChangeActivePaneItem(item) {
		if (item && item.getPath) {
			this.togglePanel(item);
		}
	}

	// delve events

	_onDelveDidFinish() {
		// the debugger has finished and therefore all breakpoints go back to state inactive
		this.editors.forEach((e) => {
			e.updateBreakpoints(Editor.breakpointStates.inactive);
		});

		// finish delve
		this.delve.destroy();
		this.delve = null;

		this.setSelectedStacktraceIndex(0);
	}
}
