"use babel";

import Controller from "./controller";

export default {
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
