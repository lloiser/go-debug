"use babel";

import { Emitter } from "atom";
import { spawn } from "child_process";
import rpc from "json-rpc2";
import * as path from "path";
import { log } from "./utils";

const DELVE_CMD = "dlv";
const SERVER_URL = "localhost";
const SERVER_PORT = 2345;
const RPC_ENDPOINT = "RPCServer.";

const COMMANDS = {
	continue: "continue",
	next: "next",
	step: "step"
};

let process;

export default class Delve {
	static runPackageTests(file) {
		return Delve.run(file, "test");
	}

	static runPackage(file) {
		return Delve.run(file, "debug");
	}

	static run(file, method) {
		return new Promise((resolve, reject) => {
			if (process) {
				return;
			}

			const args = [method, "--headless=true", `--listen=${SERVER_URL}:${SERVER_PORT}`, "--log"];
			process = spawn(DELVE_CMD, args, {
				cwd: path.dirname(file)
			});

			let rpcClient;
			process.stderr.on("data", (chunk) => {
				log("stderr data:", chunk.toString());
				if (!rpcClient) {
					rpcClient = rpc.Client.$create(SERVER_PORT, SERVER_URL);
					rpcClient.connectSocket((err, conn) => {
						if (err) {
							process.kill();
							reject(err);
							return;
						}
						const delve = new Delve(conn);
						resolve(delve);
					});
				}
			});
			process.stdout.on("data", (chunk) => {
				log("stdout data:", chunk.toString());
			});
			process.on("close", (code) => {
				log("close code:", code);
			});
			process.on("error", (args) => {
				log("error code:", args);
			});
		});
	}

	constructor(connection) {
		this._connection = connection;
		this.emitter = new Emitter();
		this.state = null;
		this.stacktrace = [];
		this._breakpoints = {};
	}

	destroy() {
		// kill/end everything
		process.kill();
		process = null;
		this._connection.end();
		this.emitter.dispose();
	}

	// returns the state of the breakpoint at the given file and line
	breakpointAt(file, line) {
		const key = file + "|" + line;
		return !!this._breakpoints[key];
	}

	// API

	createBreakpoint(file, line) {
		const key = file + "|" + line;
		const existingBp = this._breakpoints[key];
		if (existingBp) {
			// breakpoint already exists
			return Promise.resolve();
		}

		// note: delve requires 1 indexed line numbers whereas atom has 0 indexed
		return this.call("CreateBreakpoint", { file, line: line + 1 }).then((response) => {
			this._breakpoints[key] = response;
		});
	}

	clearBreakpoint(file, line) {
		const key = file + "|" + line;
		const dlvBp = this._breakpoints[key];
		delete this._breakpoints[key];
		if (!dlvBp) {
			// either already deleted or not approved by delve yet
			// -> anyway delete and inform everyone
			return Promise.resolve();
		}

		return this.call("ClearBreakpoint", dlvBp.id).then(() => {
			delete this._breakpoints[key];
		});
	}

	continue() {
		return this.call("Command", { name: COMMANDS.continue }).then(this.setState.bind(this));
	}

	next() {
		return this.call("Command", { name: COMMANDS.next }).then(this.setState.bind(this));
	}

	step() {
		return this.call("Command", { name: COMMANDS.step }).then(this.setState.bind(this));
	}

	restart() {
		return this.call("Restart", []).then(this.setState.bind(this, null));
	}

	stacktraceGoroutine() {
		if (!this.state || this.isDone()) {
			this.stacktrace = [];
			return Promise.resolve();
		}

		const args = {
			id: this.getGoroutineID(),
			depth: 20,
			full: true
		};
		return this.call("StacktraceGoroutine", args).then((stacktrace) => {
			this.stacktrace = stacktrace;
		});
	}

	call(method, ...args) {
		return new Promise((resolve, reject) => {
			log("RPC.%s:", method);
			this._connection.call(RPC_ENDPOINT + method, args, (err, result) => {
				if (err) {
					log("RPC.%s error:", method, err);
					reject(err);
					return;
				}
				log("RPC.%s result:", method, result);
				resolve(result);
			});
		});
	}

	// callbacks

	setState(state) {
		this.state = state;
		if (this.isDone()) {
			this.done();
			return Promise.resolve();
		}

		return this.stacktraceGoroutine();
	}

	// helpers

	done() {
		this.emitter.emit("did-finish");
	}
	isDone() {
		return this.state ? this.state.exited : false;
	}

	getGoroutineID() {
		return this.state.currentGoroutine.id;
	}

	// events

	onDidFinish(callback) {
		this.emitter.on("did-finish", callback);
	}
}
