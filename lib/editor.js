"use babel";

import { Emitter } from "atom";
import { createElement } from "./utils";

// TEST

export default class Editor {
	constructor(editor) {
		this.editor = editor;
		this.breakpoints = {};
		this.emitter = new Emitter();

		this.gutter = this.editor.addGutter({
			name: "go-debug",
			priority: -100
		});

		// add click event to the gutter to add breakpoints
		const gutterView = atom.views.getView(this.gutter);
		gutterView.addEventListener("click", this._onGutterClick.bind(this));
	}

	// atom API

	serialize() {
		const breakpoints = Object.keys(this.breakpoints);
		if (breakpoints.length === 0) {
			// no need to serialize it
			return undefined;
		}
		return { breakpoints: breakpoints.map((l) => parseInt(l, 10)) };
	}
	destroy() {
		this.gutter.destroy();
	}

	// public API

	updateBreakpoint(line, state) {
		let deco = this.breakpoints[line];
		if (!deco) {
			// create, store and publish breakpoint
			const marker = this.editor.markBufferPosition({ row: line });
			deco = this.gutter.decorateMarker(marker, this.getBreakpointDecoration(state));

			this.breakpoints[line] = deco;
			this.emitter.emit("did-create-breakpoint", { file: this.editor.getPath(), line });
		} else {
			// update the props of the decoration
			const newProps = Object.assign(
				{},
				deco.getProperties(),
				this.getBreakpointDecoration(state)
			);
			deco.setProperties(newProps);
		}
	}
	updateBreakpoints(state) {
		Object.keys(this.breakpoints).forEach((line) => {
			this.updateBreakpoint(line, state);
		});
	}

	// events

	onDidCreateBreakpoint(callback) {
		this.emitter.on("did-create-breakpoint", callback);
	}
	onDidClearBreakpoint(callback) {
		this.emitter.on("did-clear-breakpoint", callback);
	}

	// DOM events

	_onGutterClick(ev) {
		const editorView = atom.views.getView(this.editor);
		const { row: line } = editorView.component.screenPositionForMouseEvent(ev);

		const deco = this.breakpoints[line];
		if (deco) {
			deco.destroy();
			delete this.breakpoints[line];
			this.emitter.emit("did-clear-breakpoint", { file: this.editor.getPath(), line: line });
			return;
		}

		// create an inactive breakpoint
		this.updateBreakpoint(line, Editor.breakpointStates.inactive);
	}

	// helper

	getBreakpointDecoration(state) {
		return {
			class: "go-debug-gutter-breakpoint",
			item: createElement("div", [state])
		};
	}
}

Editor.breakpointStates = {
	// already approved and ready to be hit by the debugger
	active: "active",
	// debugger does not know about this debugger yet, but we have to display i
	inactive: "inactive"
	// invalid: "invalid" // breakpoint at this position cannot be hit
	// deactivated: "deactivated" // breakpoint cannot be hit currently
};
