"use babel";

import * as Delve from "./delve";
import { store } from "./store";

function currentFile() {
	const editor = atom.workspace.getActiveTextEditor();
	return editor && editor.getPath();
}

function currentLine() {
	const editor = atom.workspace.getActiveTextEditor();
	return editor && editor.getCursorBufferPosition().row;
}

const commands = {
	"run-tests": {
		cmd: "run-tests",
		text: "Test",
		title: "Run package test",
		action: () => Delve.runTests(currentFile())
	},
	"run-package": {
		cmd: "run-package",
		text: "Debug",
		title: "Debug package",
		action: () => Delve.runPackage(currentFile())
	},
	"continue": {
		cmd: "continue",
		icon: "triangle-right",
		title: "Continue",
		action: () => Delve.command("continue")
	},
	"next": {
		cmd: "next",
		icon: "arrow-right",
		title: "Next",
		action: () => Delve.command("next")
	},
	"step": {
		cmd: "step",
		icon: "arrow-down",
		title: "Step",
		action: () => Delve.command("step")
	},
	"restart": {
		cmd: "restart",
		icon: "sync",
		title: "Restart",
		action: () => Delve.restart()
	},
	"stop": {
		cmd: "stop",
		icon: "primitive-square",
		title: "Stop",
		action: () => Delve.stop()
	},
	"toggle-breakpoint": {
		action: () => Delve.toggleBreakpoint(currentFile(), currentLine())
	},
	"toggle-panel": {
		action: () => store.dispatch({ type: "TOGGLE_PANEL" })
	}
};

const keyboardCommands = {};
["run-tests", "run-package", "continue", "next", "step", "restart", "stop", "toggle-breakpoint"]
	.forEach((cmd) => keyboardCommands["go-debug:" + cmd] = commands[cmd].action);

const panelCommandsNotReady = [
	commands["run-tests"],
	commands["run-package"]
];
const panelCommandsReady = [
	commands.continue,
	commands.next,
	commands.step,
	commands.restart,
	commands.stop
];

export const getPanelCommands = () => Delve.isStarted() ? panelCommandsReady : panelCommandsNotReady;

export const get = (cmd) => commands[cmd];

export const getKeyboardCommands = () => keyboardCommands;
