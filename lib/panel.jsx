"use babel";

import { CompositeDisposable } from "atom";
import path from "path";
import { React, ReactDOM } from "react-for-atom";
import { Provider, connect } from "react-redux";

import Variables from "./variables.jsx";
import { elementPropInHierarcy } from "./utils";
import { store } from "./store";
import * as Delve from "./delve";

const COMMANDS_LAYOUT_NOT_READY = [
	// TODO: maybe inline them and add custom logic (progress wheel etc)?
	{ cmd: "runTests",   text: "Test",  title: "Run package test" },
	{ cmd: "runPackage", text: "Debug", title: "Debug package" }
];
const COMMANDS_LAYOUT_READY = [
	{ cmd: "continue", icon: "triangle-right",   title: "Continue" },
	{ cmd: "next",     icon: "arrow-right",      title: "Next" },
	{ cmd: "step",     icon: "arrow-down",       title: "Step" },
	{ cmd: "restart",  icon: "sync",             title: "Restart" },
	{ cmd: "stop",     icon: "primitive-square", title: "Stop" }
];

class Panel extends React.Component {
	constructor(props) {
		super(props);

		this.onResizeStart = this.onResizeStart.bind(this);
		this.onResize = this.onResize.bind(this);
		this.onResizeEnd = this.onResizeEnd.bind(this);
		this.onCommandClick = this.onCommandClick.bind(this);
		this.onStacktraceClick = this.onStacktraceClick.bind(this);
		this.onGoroutineClick = this.onGoroutineClick.bind(this);
		this.onBreakpointClick = this.onBreakpointClick.bind(this);

		this.state = {
			expanded: {
				stacktrace: true,
				goroutines: true,
				variables: true,
				breakpoints: true
			}
		};
	}

	componentWillReceiveProps(np) {
		this.setState({ width: np.width });
	}

	render() {
		// TODO: add the busy overlay if state == "busy" || "starting"
		return <div className="go-debug-panel-root" style={{width: this.props.width}}>
			<div className="go-debug-panel-resizer" onMouseDown={this.onResizeStart} />
			{this.renderCommands()}
			<div className="go-debug-panel-content">
				{this.renderStacktrace()}
				{this.renderGoroutines()}
				{this.renderVariables()}
				{this.renderBreakpoints()}
			</div>
			<button type="button" onClick={this.props.onToggleOutput}
				className="btn go-debug-btn-flat go-debug-panel-showoutput">
				Toggle output panel
			</button>
		</div>;
	}

	renderCommands() {
		const layout = Delve.isStarted() ? COMMANDS_LAYOUT_READY : COMMANDS_LAYOUT_NOT_READY;
		return <div className="go-debug-panel-commands">{layout.map(this.renderCommand, this)}</div>;
	}
	renderCommand(btn, i) {
		return <button key={i} type="button" className="btn go-debug-btn-flat" title={btn.title}
			data-cmd={btn.cmd} onClick={this.onCommandClick}>
			{btn.icon ? <span className={"icon-" + btn.icon} /> : null}
			{btn.text}
		</button>;
	}

	renderStacktrace() {
		const { selectedStacktrace } = this.props;
		const items = (this.props.stacktrace || []).map((st, index) => {
			const className = selectedStacktrace === index ? "selected" : null;
			const file = shortenPath(st.file);
			const fn = st.function.name.split("/").pop();
			return <div key={index} className={className} data-index={index} onClick={this.onStacktraceClick}>
				<div>{fn}</div>
				<div>@ {file}</div>
			</div>;
		});
		return this.renderExpandable("stacktrace", "Stacktrace", items);
	}

	renderGoroutines() {
		const { selectedGoroutine } = this.props;
		const items = (this.props.goroutines || []).map(({ id, userCurrentLoc }) => {
			const className = selectedGoroutine === id ? "selected" : null;
			const file = shortenPath(userCurrentLoc.file);
			const fn = userCurrentLoc.function.name.split("/").pop();
			return <div key={id} className={className} data-id={id} onClick={this.onGoroutineClick}>
				<div>{fn}</div>
				<div>@ {file}</div>
			</div>;
		});
		return this.renderExpandable("goroutines", "Goroutines", items);
	}

	renderVariables() {
		return this.renderExpandable("variables", "Variables", <Variables />);
	}

	renderBreakpoints() {
		const items = this.props.breakpoints.map(({ file, line, state, message }) => {
			return <div key={file + "|" + line} data-file={file} title={message || ""}
				data-line={line} onClick={this.onBreakpointClick}>
				<span className={"go-debug-breakpoint go-debug-breakpoint-state-" + state} />
				{shortenPath(file)}:{line+1}
			</div>;
		});
		return this.renderExpandable("breakpoints", "Breakpoints", items);
	}

	renderExpandable(name, text, content) {
		const expanded = this.state.expanded[name];
		return <div className="go-debug-expandable" data-expanded={expanded}>
			<div className="go-debug-expandable-header" onClick={this.onExpandChange.bind(this, name)}>
				<span className={"go-debug-toggle icon icon-chevron-" + (expanded ? "down" : "right")}></span>
				{text}
			</div>
			<div className={`go-debug-expandable-body go-debug-panel-${name}`}>{content}</div>
		</div>;
	}

	onResizeStart() {
		document.addEventListener("mousemove", this.onResize, false);
		document.addEventListener("mouseup", this.onResizeEnd, false);
		this.setState({ resizing: true });
	}
	onResize({ pageX }) {
		if (!this.state.resizing) {
			return;
		}
		const node = ReactDOM.findDOMNode(this).offsetParent;
		this.props.onUpdateWidth(node.getBoundingClientRect().width + node.offsetLeft - pageX);
	}
	onResizeEnd() {
		if (!this.state.resizing) {
			return;
		}
		document.removeEventListener("mousemove", this.onResize, false);
		document.removeEventListener("mouseup", this.onResizeEnd, false);
		this.setState({ resizing: false });
	}

	onExpandChange(name) {
		this.state.expanded[name] = !this.state.expanded[name];
		this.setState(this.state);
	}

	onCommandClick(ev) {
		const command = elementPropInHierarcy(ev.target, "dataset.cmd");
		if (!command) {
			return;
		}
		const view = atom.views.getView(atom.workspace.getActiveTextEditor());
		atom.commands.dispatch(view, `go-debug:${command}`);
	}

	onStacktraceClick(ev) {
		const index = elementPropInHierarcy(ev.target, "dataset.index");
		if (index) {
			Delve.selectStacktrace(+index);
		}
	}

	onGoroutineClick(ev) {
		const id = elementPropInHierarcy(ev.target, "dataset.id");
		if (id) {
			Delve.selectGoroutine(+id);
		}
	}

	onBreakpointClick(ev) {
		const file = elementPropInHierarcy(ev.target, "dataset.file");
		if (file) {
			const line = +elementPropInHierarcy(ev.target, "dataset.line");
			atom.workspace.open(file, { initialLine: line, searchAllPanes: true }).then(() => {
				const editor = atom.workspace.getActiveTextEditor();
				editor.scrollToBufferPosition([line, 0], { center: true });
			});
		}
	}
}

const PanelListener = connect(
	(state) => {
		return {
			width: state.panel.width,
			state: state.delve.state,
			stacktrace: state.delve.stacktrace,
			goroutines: state.delve.goroutines,
			breakpoints: state.delve.breakpoints,
			selectedStacktrace: state.delve.selectedStacktrace,
			selectedGoroutine: state.delve.selectedGoroutine
		};
	},
	(dispatch) => {
		return {
			onUpdateWidth: (width) => {
				dispatch({ type: "SET_PANEL_WIDTH", width });
			},
			onToggleOutput: () => {
				dispatch({ type: "TOGGLE_OUTPUT" });
			}
		};
	}
)(Panel);

let atomPanel;

function onStoreChange() {
	const panelState = store.getState().panel;
	if (panelState.visible !== atomPanel.isVisible()) {
		atomPanel[panelState.visible ? "show" : "hide"]();
	}
}

let subscriptions;
export default {
	init() {
		subscriptions = new CompositeDisposable(
			{ dispose: store.subscribe(onStoreChange) }
		);

		const item = document.createElement("div");
		item.className = "go-debug-panel";
		atomPanel = atom.workspace.addRightPanel({ item, visible: store.getState().panel.visible });

		ReactDOM.render(
			<Provider store={store}>
				<PanelListener />
			</Provider>,
			item
		);
	},
	dispose() {
		subscriptions.dispose();
		subscriptions = null;

		ReactDOM.unmountComponentAtNode(atomPanel.getItem());

		atomPanel.destroy();
		atomPanel = null;
	}
};

function shortenPath(file) {
	return path.normalize(file).split(path.sep).slice(-2).join(path.sep);
}
