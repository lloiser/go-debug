"use babel";

import { spawn } from "child_process";
import rpc from "json-rpc2";
import * as path from "path";
import { log } from "./utils";
import { store, getBreakpoint, getBreakpoints } from "./store";

const SERVER_URL = "localhost";
const SERVER_PORT = 2345;
const RPC_ENDPOINT = "RPCServer.";

let dlvProcess;
let dlvConnection;
let dlvPath;

export function setDlvPath(path) {
	dlvPath = path;
}

export function runTests(file) {
	return run(file, "test");
}

export function runPackage(file) {
	return run(file, "debug");
}

function run(file, method) {
	if (!dlvPath || dlvProcess || !file) {
		return;
	}
	store.dispatch({ type: "SET_STATE", state: "starting" });

	const args = [method, "--headless=true", `--listen=${SERVER_URL}:${SERVER_PORT}`, "--log"];
	dlvProcess = spawn(dlvPath, args, {
		cwd: path.dirname(file)
	});

	let rpcClient;
	dlvProcess.stderr.on("data", (chunk) => {
		log("stderr data:", chunk.toString());
		if (!rpcClient) {
			rpcClient = rpc.Client.$create(SERVER_PORT, SERVER_URL);
			rpcClient.connectSocket((err, conn) => {
				if (err) {
					log("Failed to start delve - error:", err);
					stop();
					return;
				}
				dlvConnection = conn;
				store.dispatch({ type: "SET_STATE", state: "started" });

				getBreakpoints().forEach((bp) => {
					addBreakpoint(bp.file, bp.line);
				});
			});
		}
	});

	dlvProcess.on("close", (code) => {
		const msg = `delve closed with code ${code}`;
		log(msg);
		stop();
	});
	dlvProcess.on("error", (err) => {
		log("error:", err);
		stop();
	});
}

export function stop() {
	if (dlvConnection) {
		dlvConnection.end();
	}
	dlvConnection = null;

	if (dlvProcess) {
		dlvProcess.kill();
	}
	dlvProcess = null;

	store.dispatch({ type: "STOP" });
}

export function addBreakpoint(file, line) {
	if (!isStarted()) {
		store.dispatch({ type: "ADD_BREAKPOINT", bp: { file, line, state: "notStarted" } });
		return;
	}

	const bp = getBreakpoint(file, line);
	if (bp && bp.state === "busy") {
		return;
	}

	// note: delve requires 1 indexed line numbers whereas atom has 0 indexed
	store.dispatch({ type: "ADD_BREAKPOINT", bp: { file, line } });
	call("CreateBreakpoint", { file, line: line + 1 }).then((response) => {
		store.dispatch({ type: "ADD_BREAKPOINT", bp: { file, line, id: response.id, state: "valid" } });
	}).catch((err) => {
		store.dispatch({ type: "ADD_BREAKPOINT", bp: { file, line, state: "invalid", message: err } });
	});
}

export function removeBreakpoint(file, line) {
	const bp = getBreakpoint(file, line);
	if (!bp) {
		return;
	}

	if (bp.state === "invalid" || !isStarted()) {
		store.dispatch({ type: "REMOVE_BREAKPOINT", bp: { file, line, state: "removed" } });
		return;
	}

	store.dispatch({ type: "REMOVE_BREAKPOINT", bp: { file, line, state: "busy" } });
	call("ClearBreakpoint", bp.id).then(() => {
		store.dispatch({ type: "REMOVE_BREAKPOINT", bp: { file, line, state: "removed" } });
	});
}

// command executes the given command (like continue, step, next, ...)
export function command(name) {
	store.dispatch({ type: "SET_STATE", state: "busy" });
	call("Command", { name }).then((newState) => {
		if (newState.exited) {
			stop();
			return;
		}

		store.dispatch({ type: "SET_STATE", state: "waiting" });

		selectGoroutine(newState.currentGoroutine.id);
		selectStacktrace(0);

		getGoroutines();
	});
}

// restart the delve session
export function restart() {
	call("Restart", []).then(() => {
		store.dispatch({ type: "RESTART" });
	});
}

function getStacktrace() {
	const args = {
		id: store.getState().delve.selectedGoroutine,
		depth: 20,
		full: true
	};
	call("StacktraceGoroutine", args).then((stacktrace) => {
		store.dispatch({ type: "UPDATE_STACKTRACE", stacktrace });
	});
}

function getGoroutines() {
	call("ListGoroutines").then((goroutines) => {
		store.dispatch({ type: "UPDATE_GOROUTINES", goroutines });
	});
}

export function selectStacktrace(index) {
	store.dispatch({ type: "SET_SELECTED_STACKTRACE", index });
}

export function selectGoroutine(id) {
	if (store.getState().delve.selectedGoroutine === id) {
		getStacktrace();
		return; // no need to change
	}
	store.dispatch({ type: "SET_SELECTED_GOROUTINE", state: "busy", id });
	call("Command", { name: "switchGoroutine", goroutineID: id }).then(() => {
		store.dispatch({ type: "SET_SELECTED_GOROUTINE", state: "waiting", id });
		getStacktrace();
	});
}

// call is the base method for all calls to delve
function call(method, ...args) {
	return new Promise((resolve, reject) => {
		const endpoint = RPC_ENDPOINT + method;
		log("calling %s", endpoint, args);
		dlvConnection.call(endpoint, args, (err, result) => {
			if (err) {
				log("called %s - error:", endpoint, err);
				reject(err);
				return;
			}
			log("called %s - result:", endpoint, result);
			resolve(result);
		});
	});
}

export function isStarted() {
	const state = store.getState().delve.state;
	return state !== "notStarted" && state !== "starting";
}
