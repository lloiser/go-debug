"use babel";

import { createStore, combineReducers } from "redux";

const assign = (...items) => Object.assign.apply(Object, [{}].concat(items));

function updateArrayItem(array, index, o) {
	return array.slice(0, index).concat(
		assign(array[index], o),
		array.slice(index + 1)
	);
}

function stacktrace(state = [], action) {
	switch (action.type) {
		case "RESTART":
		case "STOP":
			return [];

		case "UPDATE_STACKTRACE":
			// attempt to copy the variables over to the new stacktrace
			return action.stacktrace.map((stack) => {
				const existingStack = state.find((st) => st.pc === stack.pc);
				if (!stack.variables && existingStack) {
					stack.variables = existingStack.variables;
				}
				return stack;
			});

		case "UPDATE_VARIABLES":
			var variables = state[action.index].variables;
			if (action.path) {
				// update the variable at "path" to loaded
				variables = assign(variables, {
					[action.path]: assign(variables[action.path], { loaded: true })
				});
			}

			// TODO: update each variable in action.variables on its own? probably...
			variables = assign(variables, action.variables);
			return updateArrayItem(state, action.index, { variables: variables });
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
			return updateArrayItem(state, index, bp);

		case "REMOVE_BREAKPOINT":
			if (bp.state !== "busy") {
				return index === -1 ? state : state.slice(0, index).concat(state.slice(index + 1));
			}
			return updateArrayItem(state, index, bp);

		case "UPDATE_BREAKPOINT_LINE":
			if (index !== -1) {
				return updateArrayItem(state, index, { line: action.newLine });
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
function args(state = "", action) {
	if (action.type === "UPDATE_ARGS") {
		return action.args;
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
	args,
	path
});


function editors(state = {}, action) {
	void action;
	return state;
}
const getDefaultPanel = () => {
	return { visible: atom.config.get("go-debug.panelInitialVisible") };
};
function panel(state, action) {
	if (!state) {
		state = getDefaultPanel();
	}
	switch (action.type) {
		case "TOGGLE_PANEL":
			return assign(state, { visible: "visible" in action ? action.visible : !state.visible });

		case "SET_PANEL_WIDTH":
			return assign(state, { width: action.width });
	}
	return state;
}
const defaultOutput = {
	messages: [],
	visible: false,
	filters: { delve: true, output: true }
};
function output(state = defaultOutput, action) {
	switch (action.type) {
		case "TOGGLE_OUTPUT":
			return assign(state, { visible: "visible" in action ? action.visible : !state.visible });

		case "CLEAN_OUTPUT":
			return assign(state, { messages: [] });

		case "ADD_OUTPUT_MESSAGE": {
			const messages = state.messages.concat({ message: action.message, type: action.messageType });
			return assign(state, { messages: messages });
		}

		case "TOGGLE_OUTPUT_FILTER":
			return assign(state, {
				filters: assign(state.filters, {
					[action.filter]: !state.filters[action.filter]
				})
			});
	}
	return state;
}
function variables(state = { expanded: {} }, action) {
	switch (action.type) {
		case "TOGGLE_VARIABLE":
			var expanded = assign(state.expanded, {
				[action.path]: "expanded" in action ? action.expanded : !state.expanded[action.path]
			});
			return assign(state, { expanded });
	}
	return state;
}

export let store;

export function init(state) {
	if (state.breakpoints) {
		state.delve = { breakpoints: state.breakpoints };
		delete state.breakpoints;
	}
	state.panel = assign(getDefaultPanel(), state.panel);

	store = createStore(combineReducers({
		editors,
		panel,
		delve,
		output,
		variables
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
			breakpoints: state.delve.breakpoints.map(({ file, line }) => { return { file, line }; }),
			args: state.delve.args
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
