"use babel";

import { Emitter } from "atom";
import path from "path";

import Variables from "./variables";
import { createElement, elementPropInHierarcy } from "./utils";

// TODO: "stop" command
const COMMANDS = {
	"runPackageTests": { text: "Test",  title: "Run package test" },
	"runPackage":      { text: "Debug", title: "Debug package" },
	"restart":         {                title: "Restart",         icon: "sync"  },
	"continue":        {                title: "Continue",        icon: "triangle-right"  },
	"next":            {                title: "Next",            icon: "arrow-right"  },
	"step":            {                title: "Step",            icon: "arrow-down"  }
};
const COMMANDS_LAYOUT = [
	["runPackageTests", "runPackage"],
	["restart", "continue"],
	["next", "step"]
];

export default class Panel {
	constructor(element) {
		this.element = element;

		this.emitter = new Emitter();

		this.init();
		this.setDebuggerReady(false);
	}

	destroy() {
	}

	serialize() {
	}

	update(args) {
		const { stacktrace, selectedStacktraceIndex, variables } = args;

		if (stacktrace) {
			this.renderStacktrace(stacktrace, selectedStacktraceIndex);
		}
		if (variables) {
			this.renderVariables(variables);
		}
	}
	onDidSelectStacktrace(callback) {
		this.emitter.on("did-select-stacktrace", callback);
	}
	setDebuggerReady(ready) {
		this.element.dataset.debuggerReady = ready;

		COMMANDS.runPackageTests.disabled = ready;
		COMMANDS.runPackage.disabled = ready;
		COMMANDS.restart.disabled = !ready;
		COMMANDS.continue.disabled = !ready;
		COMMANDS.next.disabled = !ready;
		COMMANDS.step.disabled = !ready;
		this.renderCommands();
	}

	init() {
		// use editor specific styles to create the same look and feel (TODO subscribe to updates?)
		const fontFamily = atom.config.get("editor.fontFamily");
		const fontSize = atom.config.get("editor.fontSize");
		const font = `${fontSize}px ${fontFamily}`;

		// commands
		this.commandsElement = createElement("div", ["go-debug-panel-commands"]);
		this.commandsElement.addEventListener("click", this._onCommandClick.bind(this));
		this.element.appendChild(this.commandsElement);

		// default
		this.defaultElement = createElement("div", ["go-debug-panel-default"],
			createElement("div", [], ["Debugger not ready... ", createElement("br"), "Try \"Test\" or \"Debug\"."]));
		this.defaultElement.style.font = font;
		this.element.appendChild(this.defaultElement);

		// variables
		const variablesElement = document.createElement("ol");
		this.variables = new Variables(variablesElement);
		const variablesContainer = createElement("div", ["go-debug-panel-variables"], [variablesElement]);
		variablesContainer.style.font = font;
		this.element.appendChild(variablesContainer);

		// stacktrace
		this.stacktraceElement = createElement("div", ["go-debug-panel-stacktrace"]);
		this.stacktraceElement.addEventListener("click", this._onStacktraceClick.bind(this));
		this.element.appendChild(this.stacktraceElement);
	}

	renderCommands() {
		const frag = document.createDocumentFragment();

		const createButton = (cmd) => {
			const btnModel = COMMANDS[cmd];
			const classList = ["btn", "btn-default"].concat(btnModel.icon ? ["icon", "icon-" + btnModel.icon] : []);
			const btn = createElement("button", classList, [btnModel.text]);
			btn.type = "button";
			btn.dataset.cmd = cmd;
			btn.title = btnModel.title;
			btn.disabled = btnModel.disabled;
			return btn;
		};
		COMMANDS_LAYOUT.forEach((group) => {
			frag.appendChild(createElement("div", ["btn-group"], group.map(createButton)));
		});

		this.commandsElement.innerHTML = "";
		this.commandsElement.appendChild(frag);
	}

	renderStacktrace(stacktrace, selectedStacktraceIndex) {
		const frag = document.createDocumentFragment();

		const atomPaths = atom.project.getPaths();
		const list = createElement("ol", ["go-debug-panel-stacktrace-list"], [
			stacktrace.map((st, index) => {
				const file = stripPath(atomPaths, st.file);
				const fn = st.function.name.split("/").pop();
				const classes = selectedStacktraceIndex === index ? ["active"] : [];
				const el = createElement("li", classes, [
					fn, " @ ", file
				]);
				el.dataset.index = index;
				return el;
			})
		]);
		frag.appendChild(list);

		this.stacktraceElement.innerHTML = "";
		this.stacktraceElement.appendChild(frag);
	}

	renderVariables(variables) {
		this.variables.render(variables);
	}

	// DOM events

	_onCommandClick(ev) {
		const cmd = elementPropInHierarcy(ev.target, "dataset.cmd");
		if (!cmd) {
			return;
		}

		atom.commands.dispatch(this.element, `go-debug:${cmd}`);
	}

	_onStacktraceClick(ev) {
		const index = elementPropInHierarcy(ev.target, "dataset.index");
		if (!index) {
			return;
		}

		this.emitter.emit("did-select-stacktrace", +index);
	}
}

function stripPath(atomPaths, file) {
	// TODO: detect golang stuff and shorten it with net/http
	file = path.normalize(file);
	const found = atomPaths.find((p) => file.startsWith(p)) || "";
	if (!found) {
		return file;
	}
	return file.substring(found.length + 1);
}
