"use babel";

import { React, ReactDOM } from "react-for-atom";
import path from "path";
import { Provider, connect } from "react-redux";

import Variables from "./variables.jsx";
import { elementPropInHierarcy } from "./utils";
import { store } from "./store";
import * as Delve from "./delve";

const COMMANDS_LAYOUT_NOT_READY = [
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
		return <div className="go-debug-panel-root" style={{width: this.props.width}}>
			<div className="go-debug-panel-resizer" onMouseDown={this.onResizeStart} />
			{this.renderCommands()}
			<div className="go-debug-panel-content">
				{this.renderStacktrace()}
				{this.renderGoroutines()}
				{this.renderVariables()}
				{this.renderBreakpoints()}
			</div>
		</div>;
	}

	renderCommands() {
		const layout = Delve.isStarted() ? COMMANDS_LAYOUT_READY : COMMANDS_LAYOUT_NOT_READY;
		return <div className="go-debug-panel-commands">{layout.map(this.renderCommand, this)}</div>;
	}
	renderCommand(btn, i) {
		return <button key={i} type="button" className="btn" title={btn.title}
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
				<span className="go-debug-toggle">{expanded ? "▼" : "▶"}</span>
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
		atom.commands.dispatch(ReactDOM.findDOMNode(this), `go-debug:${command}`);
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
				dispatch({ type: "SET_WIDTH", width });
			}
		};
	}
)(Panel);

let atomPanel;

export default {
	show() {
		const el = document.createElement("div");
		el.className = "go-debug-panel";
		// el.style.width = props.state.width ? props.state.width + "px" : "";
		atomPanel = atom.workspace.addRightPanel({ // -> go-debug.panelPosition
			item: el,
			visible: true
		});

		ReactDOM.render(
			<Provider store={store}>
				<PanelListener />
			</Provider>,
			el
		);
	},
	serialize() {
		return {
			width: atomPanel.getItem().firstChild.getBoundingClientRect().width
		};
	},
	destroy() {
		atomPanel.destroy();
		atomPanel = null;
	}
};

function shortenPath(file) {
	return path.normalize(file).split(path.sep).slice(-2).join(path.sep);
}
