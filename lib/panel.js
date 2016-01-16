"use babel";

import { Emitter } from "atom";
import path from "path";

import Variables from "./variables";
import { createElement, elementPropInHierarcy } from "./utils";

export default class Panel {
	constructor(element) {
		this.element = element;

		this.emitter = new Emitter();

		this.init();
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

	init() {
		// commands
		this.commandsElement = createElement("div", ["go-debug-panel-commands"]);
		this.commandsElement.addEventListener("click", this._onCommandClick.bind(this));
		this.renderCommands();
		this.element.appendChild(this.commandsElement);

		// variables
		const variablesElement = document.createElement("ol");
		this.variables = new Variables(variablesElement);
		const variablesContainer = createElement("div", ["go-debug-panel-variables"], [variablesElement]);

		// use editor specific styles to create the same look and feel
		const font = atom.config.get("editor.fontFamily");
		const fontSize = atom.config.get("editor.fontSize");
		variablesContainer.style.font = `${fontSize}px ${font}`;

		this.element.appendChild(variablesContainer);

		// stacktrace
		this.stacktraceElement = createElement("div", ["go-debug-panel-stacktrace"]);
		this.stacktraceElement.addEventListener("click", this._onStacktraceClick.bind(this));
		this.element.appendChild(this.stacktraceElement);
	}

	renderCommands() {
		// TODO: pass in commands too!
		// TODO: "stop" command

		const frag = document.createDocumentFragment();

		const createButton = (cmd, text, title, icon) => {
			const classList = ["btn", "btn-default"].concat(icon ? ["icon", "icon-" + icon] : []);
			const btn = createElement("button", classList, [text]);
			btn.type = "button";
			btn.dataset.cmd = cmd;
			btn.title = title;
			return btn;
		};

		frag.appendChild(
			createElement("div", ["btn-group"], [
				createButton("runPackageTests", "Test", "Test"),
				createButton("runPackage",      "Debug", "Debug")
			])
		);
		frag.appendChild(
			createElement("div", ["btn-group"], [
				createButton("restart",  null, "Restart",  "sync"),
				createButton("continue", null, "Continue", "triangle-right")
			])
		);
		frag.appendChild(
			createElement("div", ["btn-group"], [
				createButton("next", null, "Next", "arrow-right"),
				createButton("step", null, "Step", "arrow-down")
			])
		);

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
