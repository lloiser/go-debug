"use babel";

import { spawn } from "child_process";
import rpc from "json-rpc2";
import * as path from "path";
import { store, getBreakpoint, getBreakpoints } from "./store";
import * as DelveVariables from "./delve-variables";

const SERVER_URL = "localhost";
const SERVER_PORT = 2345;
const RPC_ENDPOINT = "RPCServer.";

let dlvProcess;
let dlvConnection;

export function runTests(file) {
	return run(file, "test");
}

export function runPackage(file) {
	return run(file, "debug");
}

function addOutputMessage(messageType, message) {
	store.dispatch({ type: "ADD_OUTPUT_MESSAGE", messageType, message });
}

function run(file, method) {
	const { path: dlvPath, args } = store.getState().delve;
	if (!dlvPath || dlvProcess || !file) {
		return;
	}

	const panelState = store.getState().panel;
	if (!panelState.visible) {
		store.dispatch({ type: "TOGGLE_PANEL" });
	}

	store.dispatch({ type: "SET_STATE", state: "starting" });

	let dlvArgs = [method, "--headless=true", `--listen=${SERVER_URL}:${SERVER_PORT}`, "--log"];
	if (args && method !== "test") {
		dlvArgs = dlvArgs.concat("--", splitArgs(args));
	}

	addOutputMessage("delve", `Starting delve with "${file}" with "${method}"`);
	dlvProcess = spawn(dlvPath, dlvArgs, {
		cwd: path.dirname(file)
	});

	let rpcClient;
	dlvProcess.stderr.on("data", (chunk) => {
		addOutputMessage("delve", "Delve output: " + chunk.toString());
		if (!rpcClient) {
			rpcClient = rpc.Client.$create(SERVER_PORT, SERVER_URL);
			rpcClient.connectSocket((err, conn) => {
				if (err) {
					addOutputMessage("delve", `Failed to start delve\n\terror: ${err}`);
					stop();
					return;
				}
				dlvConnection = conn;
				addOutputMessage("delve", `Started delve with "${file}" with "${method}"`);
				store.dispatch({ type: "SET_STATE", state: "started" });

				getBreakpoints().forEach((bp) => {
					addBreakpoint(bp.file, bp.line);
				});
			});
		}
	});

	dlvProcess.stdout.on("data", (chunk) => {
		addOutputMessage("output", chunk.toString());
	});

	dlvProcess.on("close", (code) => {
		addOutputMessage("delve", "delve closed with code " + code);
		stop();
	});
	dlvProcess.on("error", (err) => {
		addOutputMessage("delve", "error: " + err);
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
		return Promise.resolve();
	}

	const bp = getBreakpoint(file, line);
	if (bp && bp.state === "busy") {
		return Promise.resolve();
	}

	// note: delve requires 1 indexed line numbers whereas atom has 0 indexed
	const fileAndLine = `${file}:${line + 1}`;
	addOutputMessage("delve", `Adding breakpoint: ${fileAndLine}`);
	store.dispatch({ type: "ADD_BREAKPOINT", bp: { file, line } });
	return _addBreakpoint(file, line + 1)
		.then((response) => {
			addOutputMessage("delve", `Added breakpoint: ${fileAndLine}`);
			store.dispatch({ type: "ADD_BREAKPOINT", bp: { file, line, id: response.id, state: "valid" } });
		})
		.catch((err) => {
			addOutputMessage("delve", `Adding breakpoint failed: ${fileAndLine}\n\terror: ${err}`);
			store.dispatch({ type: "ADD_BREAKPOINT", bp: { file, line, state: "invalid", message: err } });
		});
}
function _addBreakpoint(file, line) {
	return call("CreateBreakpoint", { file, line });
}

export function removeBreakpoint(file, line) {
	const bp = getBreakpoint(file, line);
	if (!bp) {
		return Promise.resolve();
	}

	function done() {
		store.dispatch({ type: "REMOVE_BREAKPOINT", bp: { file, line, state: "removed" } });
	}

	if (bp.state === "invalid" || !isStarted()) {
		return Promise.resolve().then(done);
	}

	const fileAndLine = `${file}:${line + 1}`;
	addOutputMessage("delve", `Removing breakpoint: ${fileAndLine}`);
	store.dispatch({ type: "REMOVE_BREAKPOINT", bp: { file, line, state: "busy" } });
	return _removeBreakpoint(bp.id)
		.then(() => addOutputMessage("delve", `Removed breakpoint: ${fileAndLine}`))
		.then(done);
}
function _removeBreakpoint(id) {
	return call("ClearBreakpoint", id);
}

export function toggleBreakpoint(file, line) {
	const bp = getBreakpoint(file, line);
	if (!bp) {
		return addBreakpoint(file, line);
	}
	return removeBreakpoint(file, line);
}

export function updateBreakpointLine(file, line, newLine) {
	const bp = getBreakpoint(file, line);
	if (!isStarted()) {
		// just update the breakpoint in the store
		store.dispatch({ type: "UPDATE_BREAKPOINT_LINE", bp, newLine });
		return;
	}

	// remove and add the breakpoint, this also updates the store correctly
	_removeBreakpoint(bp.id).then(() => _addBreakpoint(file, newLine));
}

// command executes the given command (like continue, step, next, ...)
export function command(name) {
	if (!isStarted()) {
		return;
	}
	addOutputMessage("delve", `Executing command ${name}`);
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
	if (!isStarted()) {
		return;
	}
	call("Restart", []).then(() => {
		store.dispatch({ type: "RESTART" });
	});
}

function getStacktrace() {
	if (!isStarted()) {
		return;
	}
	const args = {
		id: store.getState().delve.selectedGoroutine,
		depth: 20,
		full: true
	};
	call("StacktraceGoroutine", args).then((stacktrace) => {
		// prepare the variables
		prepareVariables(stacktrace);
		store.dispatch({ type: "UPDATE_STACKTRACE", stacktrace });
	});
}

function prepareVariables(stacktrace) {
	stacktrace.forEach((stack) => {
		stack.variables = DelveVariables.create(stack.Locals.concat(stack.Arguments));
	});
}

function getGoroutines() {
	if (!isStarted()) {
		return;
	}
	call("ListGoroutines").then((goroutines) => {
		store.dispatch({ type: "UPDATE_GOROUTINES", goroutines });
	});
}

export function selectStacktrace(index) {
	store.dispatch({ type: "SET_SELECTED_STACKTRACE", index });
}

export function selectGoroutine(id) {
	if (!isStarted()) {
		return;
	}
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
		dlvConnection.call(endpoint, args, (err, result) => {
			if (err) {
				addOutputMessage("delve", `Failed to call ${method}\n\terror: ${err}`);
				reject(err);
				return;
			}
			resolve(result);
		});
	});
}

export function isStarted() {
	const state = store.getState().delve.state;
	return state !== "notStarted" && state !== "starting";
}

// thanks to "yargs-parser" for this simple arguments parser!
function splitArgs(argString) {
	let i = 0;
	let c = null;
	let opening = null;
	const args = [];

	for (let j = 0; j < argString.length; j++) {
		c = argString.charAt(j);

		// split on spaces unless we're in quotes.
		if (c === " " && !opening) {
			i++;
			continue;
		}

		// don't split the string if we're in matching
		// opening or closing single and double quotes.
		if (c === opening) {
			opening = null;
			continue;
		} else if ((c === "'" || c === "\"") && !opening) {
			opening = c;
			continue;
		}

		if (!args[i]) {
			args[i] = "";
		}
		args[i] += c;
	}

	return args;
}

export function dispose() {
	stop();
}

function locate(goconfig) {
	return goconfig.locator.findTool("dlv");
}

export function get(goget, goconfig) {
	return locate(goconfig).then((p) => {
		if (p) {
			return p;
		}

		// check if GOPATH is actually available in goconfig!
		if (!assertGOPATH(goconfig)) {
			return Promise.reject("Environment variable \"GOPATH\" is not available!");
		}

		if (process.platform === "darwin") {
			return getOnOSX(goconfig);
		}

		return goget.get({
			name: "go-debug",
			packageName: "dlv",
			packagePath: "github.com/derekparker/delve/cmd/dlv",
			type: "missing"
		}).then((r) => {
			if (!r.success) {
				return Promise.reject("Failed to install \"dlv\" via \"go get -u github.com/derekparker/delve/cmd/dlv\". Please install it manually.\n" + r.result.stderr);
			}
			return locate(goconfig);
		});
	});
}
function getOnOSX(goconfig) {
	// delve is not "go get"-able on OSX yet as it needs to be signed to use it...
	// alternative: use an prebuilt dlv executable -> https://bintray.com/jetbrains/golang/delve

	let resolve, reject;
	const prom = new Promise((res, rej) => {
		resolve = res;
		reject = rej;
	});

	const request = require("request");
	const AdmZip = require("adm-zip");
	const path = require("path");
	const fs = require("fs");

	function start() {
		Promise.all([
			getVersion().then(download),
			getGoPath()
		])
		.then((results) => extract(results[0], results[1]))
		.catch(reject);
	}

	// get latest version
	function getVersion() {
		return new Promise(function(resolve, reject) {
			const url = "https://api.bintray.com/packages/jetbrains/golang/delve/versions/_latest";
			request(url, (error, response, body) => {
				if (error || response.statusCode !== 200) {
					reject(error || "Failed to determine the latest version from bintray!");
					return;
				}
				resolve(JSON.parse(body).name);
			});
		});
	}

	// download the latest version
	function download(version) {
		const o = {
			url: "https://dl.bintray.com/jetbrains/golang/com/jetbrains/delve/" + version + "/delve-" + version + ".zip",
			encoding: null
		};
		return new Promise(function(resolve, reject) {
			request(o, (error, response, body) => {
				if (error || response.statusCode !== 200) {
					reject(error || "Failed to download the latest dlv executable from bintray!");
					return;
				}
				resolve(body);
			});
		});
	}

	function getGoPath() {
		return new Promise(function(resolve) {
			const paths = goconfig.environment().GOPATH.split(path.delimiter);
			if (paths.length === 1) {
				resolve(paths[0]);
				return;
			}
			const options = paths.map((p, i) => `<option value="${i}">${p}</option>`).join("");

			// poor mans modal as the notification is not customizable ... I will not put
			// too much effort into this as it will (hopefully) not be needed in the future
			var item = document.createElement("div");
			item.innerHTML = `<p>Multiple GOPATHs detected, where do you want to put the "dlv" executable?</p>
				<select class="go-debug-mutliple-gopath-selector btn">
					<option value="">Select a path ...</option>
					${options}
				</select>
				<button type="button" class="go-debug-mutliple-gopath-btn btn">OK</button>`;

			const panel = atom.workspace.addModalPanel({ item });

			item.querySelector(".go-debug-mutliple-gopath-btn").addEventListener("click", () => {
				const { value } = item.querySelector(".go-debug-mutliple-gopath-selector");
				resolve(value ? paths[value] : null);
				panel.destroy();
			});
		});
	}

	// extract zip
	function extract(body, gopath) {
		if (!gopath) {
			resolve(null);
			return;
		}
		const zip = new AdmZip(body);

		// copy mac/dlv to $GOPATH/bin
		try {
			const binPath = path.join(gopath, "bin");
			zip.extractEntryTo("dlv/mac/dlv", binPath, false, true);
		} catch (e) {
			reject(e);
			return;
		}

		locate(goconfig).then(updatePermission).catch(reject);
	}

	// update the file permissions to be able to execute dlv
	function updatePermission(path) {
		if (!path) {
			reject("Failed to find delve executable \"dlv\" in your GOPATH");
			return;
		}
		fs.chmod(path, 0o777, (err) => {
			if (err) {
				reject(err);
				return;
			}
			resolve(path);
		});
	}

	const noti = atom.notifications.addWarning(
		"Could not find delve executable \"dlv\" in your GOPATH!",
		{
			dismissable: true,
			onDidDismiss: () => resolve(null),
			description: "Do you want to install a prebuilt/signed dlv executable from https://bintray.com/jetbrains/golang/delve ?",
			buttons: [
				{
					text: "Yes",
					onDidClick: () => {
						noti.dismiss();
						start();
					}
				},
				{
					text: "No",
					onDidClick: () => {
						noti.dismiss();
						resolve(null);
					}
				}
			]
		}
	);

	return prom;
}
function assertGOPATH(goconfig) {
	if (goconfig.environment().GOPATH) {
		return true;
	}

	atom.notifications.addWarning(
		"The environment variable \"GOPATH\" is not set!",
		{
			dismissable: true,
			description: "Starting atom via a desktop icon might not pass \"GOPATH\" to atom!\nTry starting atom from the command line instead."
		}
	);
	return false;
}
