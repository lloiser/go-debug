"use babel";

import { createStore, combineReducers } from "redux";

const assign = (...items) => Object.assign.apply(Object, [{}].concat(items));

function stacktrace(state = [], action) {
	switch (action.type) {
	case "RESTART":
	case "STOP":
		return [];

	case "UPDATE_STACKTRACE":
		return action.stacktrace;
	}
	return state;
}
function goroutines(state = [], action) {
	switch (action.type) {
	case "RESTART":
	case "STOP":
		return [];

	case "UPDATE_GOROUTINES":
		return action.goroutines;
	}
	return state;
}
function breakpoints(state = [], action) {
	const { bp } = action;
	const { file, line } = bp || {};
	const index = indexOfBreakpoint(state, file, line);
	switch (action.type) {
	case "ADD_BREAKPOINT":
		if (index === -1) {
			return state.concat(bp).sort((a, b) => {
				const s =  a.file.localeCompare(b.file);
				return s !== 0 ? s : (a.line - b.line);
			});
		}
		return state.slice(0, index).concat(
			assign(state[index], bp),
			state.slice(index + 1)
		);

	case "REMOVE_BREAKPOINT":
		if (bp.state !== "busy") {
			return index === -1 ? state : state.slice(0, index).concat(state.slice(index + 1));
		}
		return state.slice(0, index).concat(
			assign(state[index], bp),
			state.slice(index + 1)
		);

	case "UPDATE_BREAKPOINT_LINE":
		if (index !== -1) {
			return state.slice(0, index).concat(
				assign(state[index], { line: action.newLine }),
				state.slice(index + 1)
			);
		}
		return state;

	case "STOP":
		return state.map(({ file, line }) => {
			return { file, line, state: "notStarted" };
		});
	}

	return state;
}
function state(state = "notStarted", action) {
	switch (action.type) {
	case "STOP":
		return "notStarted";

	case "RESTART":
		return "started";

	case "SET_STATE":
		return action.state;

	case "SET_SELECTED_GOROUTINE":
		return action.state;
	}
	return state;
}
function selectedStacktrace(state = 0, action) {
	switch (action.type) {
	case "RESTART":
	case "STOP":
		return 0;

	case "SET_SELECTED_STACKTRACE":
		return action.index;

	case "UPDATE_STACKTRACE":
		return 0; // set back to the first function on each update
	}
	return state;
}
function selectedGoroutine(state = 0, action) {
	switch (action.type) {
	case "RESTART":
	case "STOP":
		return 0;

	case "SET_SELECTED_GOROUTINE":
		return action.id;
	}
	return state;
}
function path(state = "", action) {
	if (action.type === "SET_DLV_PATH") {
		return action.path;
	}
	return state;
}

const delve = combineReducers({
	stacktrace,
	goroutines,
	breakpoints,
	state,
	selectedStacktrace,
	selectedGoroutine,
	path
});


function editors(state = {}, action) {
	void action;
	return state;
}
function panel(state, action) {
	if (!state) {
		state = { visible: atom.config.get("go-debug.panelInitialVisible") };
	}
	switch (action.type) {
	case "TOGGLE_PANEL":
		return assign(state, { visible: "visible" in action ? action.visible : !state.visible });

	case "SET_PANEL_WIDTH":
		return assign(state, { width: action.width });
	}
	return state;
}
function output(state = { messages: [], visible: false }, action) {
	switch (action.type) {
	case "TOGGLE_OUTPUT":
		return assign(state, { visible: "visible" in action ? action.visible : !state.visible });

	case "CLEAN_OUTPUT":
		return assign(state, { messages: [] });

	case "ADD_OUTPUT_MESSAGE":
		const messages = state.messages.concat({ message: action.message, type: action.messageType });
		return assign(state, { messages: messages });
	}
	return state;
}

export let store;

export function init(state) {
	if (state.breakpoints) {
		state.delve = { breakpoints: state.breakpoints };
		delete state.breakpoints;
	}

	store = createStore(combineReducers({
		editors,
		panel,
		delve,
		output
	}), state);
}
export function dispose() {
	store = null;
}

export function serialize() {
	const state = store.getState();
	return {
		panel: state.panel,
		delve: {
			breakpoints: state.delve.breakpoints.map(({ file, line }) => { return { file, line }; })
		}
	};
}

export function indexOfBreakpoint(bps, file, line) {
	return bps.findIndex((bp) => bp.file === file && bp.line === line);
}
export function getBreakpoint(file, line) {
	const bps = store.getState().delve.breakpoints;
	const index = indexOfBreakpoint(bps, file, line);
	return index === -1 ? null : bps[index];
}
export function getBreakpoints(file) {
	const bps = store.getState().delve.breakpoints;
	return !file ? bps : bps.filter((bp) => bp.file === file);
}
