"use babel";

import Controller from "./controller";

export default {
	config: {
		delvePath: {
			title: "Delve path",
			description: "Path to the delve executable",
			type: "string",
			default: "dlv"
		},
		panelPosition: {
			title: "Panel position",
			description: "Defines the position of the panel which contains the actual variables, stacktrace, etc...",
			enum: ["Top", "Right", "Bottom", "Left"],
			type: "string",
			default: "Bottom"
		}
	},
	activate(state) {
		this.controller = new Controller(state);
	},
	deactivate() {
		this.controller.destroy();
	},
	serialize() {
		return this.controller.serialize();
	}
};
