"use babel";

import Controller from "./controller";

export default {
	config: {
		delvePath: {
			title: "Delve path",
			description: "Path to the delve executable",
			type: "string",
			default: "dlv",
			order: 1
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
