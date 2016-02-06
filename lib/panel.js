"use babel";

import { CompositeDisposable, Emitter } from "atom";
import path from "path";
import interact from "interact.js";

import Variables from "./variables";
import { createElement, elementPropInHierarcy } from "./utils";

const COMMANDS = {
	"runPackageTests": { text: "Test",  title: "Run package test" },
	"runPackage":      { text: "Debug", title: "Debug package" },
	"continue":        {                title: "Continue",        icon: "triangle-right" },
	"next":            {                title: "Next",            icon: "arrow-right" },
	"step":            {                title: "Step",            icon: "arrow-down" },
	"restart":         {                title: "Restart",         icon: "sync" },
	"halt":            {                title: "Break now",       icon: "primitive-square" }
};
const COMMANDS_LAYOUT_NOT_READY = ["runPackageTests", "runPackage"];
const COMMANDS_LAYOUT_READY = ["continue", "next", "step", "restart" /* "halt" */];

const PANEL_POSITION = {
	Top: {
		cssProp: "height",
		resize: "bottom"
	},
	Right: {
		cssProp: "width",
		resize: "left"
	},
	Bottom: {
		cssProp: "height",
		resize: "top"
	},
	Left: {
		cssProp: "width",
		resize: "right"
	}
};

export default class Panel {
	constructor(element, state = {}) {
		this.element = element;
		this.lastState = state;
		this.panelPosition = atom.config.get("go-debug.panelPosition");

		this.emitter = new Emitter();
		this.subscriptions = new CompositeDisposable();

		this.init();
		this.setDebuggerReady(false);
	}

	destroy() {
		this.subscriptions.dispose();
		this.interact.unset();
	}

	serialize() {
		const pp = PANEL_POSITION[this.panelPosition];

		const panel = Object.assign({}, this.lastState);
		panel[pp.cssProp] = this.element.getBoundingClientRect()[pp.cssProp];

		return panel;
	}

	onDidSelectStacktrace(callback) {
		this.emitter.on("did-select-stacktrace", callback);
	}
	onDidSelectGoroutine(callback) {
		this.emitter.on("did-select-goroutine", callback);
	}
	setDebuggerReady(ready) {
		this.debuggerReady = ready;
		this.element.dataset.debuggerReady = ready;

		this.renderCommands();
	}

	init() {
		// allow resizing of the panel
		const pp = PANEL_POSITION[this.panelPosition];
		this.element.style[pp.cssProp] = this.lastState ? `${this.lastState[pp.cssProp]}px` : "";
		const interactOptions = { edges: { [pp.resize]: true } };
		this.interact = interact(this.element).resizable(interactOptions).on("resizemove", (event) => {
			event.target.style[pp.cssProp] = `${event.rect[pp.cssProp]}px`;
		});

		// commands
		this.commandsElement = createElement("div", ["go-debug-panel-commands"]);
		this.commandsElement.addEventListener("click", this._onCommandClick.bind(this));

		// stacktrace
		this.stacktraceElement = createElement("div", ["go-debug-panel-stacktrace"]);

		// goroutines
		this.goroutinesElement = createElement("div", ["go-debug-panel-goroutines"]);

		this.sidePanelElement = createElement("div", ["go-debug-panel-sidepanel"], [
			this.commandsElement,
			createElement("div", [], [this.stacktraceElement, this.goroutinesElement])
		]);

		// sidepanel
		this.element.appendChild(this.sidePanelElement);

		// info
		this.defaultElement = createElement("div", ["go-debug-panel-info"],
			createElement("div", [], ["Debugger not ready... ", createElement("br"), "Try \"Test\" or \"Debug\""]));
		this.element.appendChild(this.defaultElement);

		// variables
		const variablesElement = createElement("ol");
		this.variables = new Variables(variablesElement);
		this.element.appendChild(createElement("div", ["go-debug-panel-variables"], [variablesElement]));

		this.initStylesheet();
	}

	initStylesheet() {
		// use editor specific styles to create the same look and feel (TODO subscribe to updates?)
		const fontFamily = atom.config.get("editor.fontFamily") || "Menlo, Consolas, monospace";
		const fontSize = atom.config.get("editor.fontSize") || 12;
		const lineHeight = atom.config.get("editor.lineHeight") || 1.3;
		const styleSheetSource = `.go-debug-panel-info, .go-debug-panel-variables {
			font-size: ${fontSize}px;
			font-family: ${fontFamily};
			line-height: ${lineHeight};
		}`;
		this.subscriptions.add(atom.styles.addStyleSheet(styleSheetSource, {
			sourcePath: "go-debug-panel-like-editor"
		}));
	}

	renderCommands() {
		const frag = document.createDocumentFragment();

		const createButton = (cmd) => {
			const btnModel = COMMANDS[cmd];
			const btn = createElement("button", ["btn"], [
				btnModel.icon ? createElement("span", ["icon-" + btnModel.icon]) : null,
				btnModel.text
			]);
			btn.type = "button";
			btn.dataset.cmd = cmd;
			btn.title = btnModel.title;
			btn.disabled = btnModel.disabled;
			frag.appendChild(btn);
		};
		const layout = this.debuggerReady ? COMMANDS_LAYOUT_READY : COMMANDS_LAYOUT_NOT_READY;
		layout.forEach(createButton);

		this.commandsElement.innerHTML = "";
		this.commandsElement.appendChild(frag);
	}

	renderStacktrace(stacktrace, selectedStacktraceIndex) {
		const frag = document.createDocumentFragment();

		frag.appendChild(createElement("strong", [], "Stacktrace"));

		// TODO: create a custom select (or find one that supports multiline and works in atom...)
		const atomPaths = atom.project.getPaths();
		const list = createElement("select", ["go-debug-panel-stacktrace-list"],
			stacktrace.map((st, index) => {
				const file = stripPath(atomPaths, st.file);
				const fn = st.function.name.split("/").pop();
				const el = createElement("option", [], [fn, " @ ", file]);
				el.value = index;
				return el;
			})
		);
		list.value = selectedStacktraceIndex;
		list.addEventListener("change", this._onStacktraceChange.bind(this));
		frag.appendChild(list);

		this.stacktraceElement.innerHTML = "";
		this.stacktraceElement.appendChild(frag);
	}

	renderVariables(variables) {
		this.variables.render(variables);
	}

	renderGoroutines(goroutines, currentGoroutineID) {
		const frag = document.createDocumentFragment();

		frag.appendChild(createElement("strong", [], "Goroutines"));

		// TODO: create a custom select (or find one that supports multiline and works in atom...)
		const atomPaths = atom.project.getPaths();
		const list = createElement("select", ["go-debug-panel-goroutines-list"],
			goroutines.map((routine) => {
				const userLoc = routine.userCurrentLoc;
				const file = stripPath(atomPaths, userLoc.file);
				const fn = userLoc.function.name.split("/").pop();
				const el = createElement("option", [], [fn, " @ ", file]);
				el.value = routine.id;
				return el;
			})
		);
		list.value = currentGoroutineID;
		list.addEventListener("change", this._onGoroutinesChange.bind(this));
		frag.appendChild(list);

		this.goroutinesElement.innerHTML = "";
		this.goroutinesElement.appendChild(frag);

	}

	// DOM events

	_onCommandClick(ev) {
		const cmd = elementPropInHierarcy(ev.target, "dataset.cmd");
		if (!cmd) {
			return;
		}

		atom.commands.dispatch(this.element, `go-debug:${cmd}`);
	}

	_onStacktraceChange(ev) {
		this.emitter.emit("did-select-stacktrace", +ev.target.value);
	}

	_onGoroutinesChange(ev) {
		this.emitter.emit("did-select-goroutine", +ev.target.value);
	}
}

function stripPath(atomPaths, file) {
	// TODO: detect golang stuff and shorten it with net/http
	// TODO: lower case the paths?
	file = path.normalize(file);
	const found = atomPaths.find((p) => file.startsWith(p)) || "";
	if (!found) {
		return file;
	}
	return file.substring(found.length + 1);
}
