"use babel";

import { CompositeDisposable } from "atom";
import { React, ReactDOM } from "react-for-atom";
import { Provider, connect } from "react-redux";

import { store } from "./store";
import Message from "./output-message";

class Output extends React.Component {
	render() {
		const items = this.props.messages.map((msg, i) => {
			return <Message key={i} message={msg.message} />;
		});
		return <div className="go-debug-output">
			<div className="go-debug-output-header">
				<h5 className="text">Output messages</h5>
				<button type="button" className="btn go-debug-btn-flat" onClick={this.props.onCleanClick}>
					<span className="icon-circle-slash" title="clean"></span>
				</button>
				<button type="button" className="btn go-debug-btn-flat" onClick={this.props.onCloseClick}>
					<span className="icon-x" title="close"></span>
				</button>
			</div>
			<div className="go-debug-output-list">{items}</div>
		</div>;
	}
}

const OutputListener = connect(
	(state) => {
		return {
			messages: state.output.messages
		};
	},
	(dispatch) => {
		return {
			onCleanClick: () => {
				dispatch({ type: "CLEAN_OUTPUT" });
			},
			onCloseClick: () => {
				dispatch({ type: "TOGGLE_OUTPUT", visible: false });
			}
		};
	}
)(Output);

let atomPanel;

function onStoreChange() {
	const outputState = store.getState().output;
	if (outputState.visible !== atomPanel.isVisible()) {
		atomPanel[outputState.visible ? "show" : "hide"]();
	}
}

let subscriptions;
export default {
	init() {
		subscriptions = new CompositeDisposable(
			{ dispose: store.subscribe(onStoreChange) }
		);

		const item = document.createElement("div");
		atomPanel = atom.workspace.addBottomPanel({ item, visible: false });

		ReactDOM.render(
			<Provider store={store}>
				<OutputListener />
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
