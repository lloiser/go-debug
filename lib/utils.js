"use babel";

const REGEX_TO_INDEX = /\[[\"\']?(\w+)[\"\']?\]/g;
const REGEX_LEADING_DOT = /^\./;
export function getDeep(o, path) {
	path = path
		// convert indexes to properties (like a["b"]['c'][0])
		.replace(REGEX_TO_INDEX, ".$1")
		// strip a leading dot (as it might occur because of the previous replace)
		.replace(REGEX_LEADING_DOT, "")
		.split(".");

	var obj = o;
	while (obj && path.length) {
		var n = path.shift();
		obj = obj[n];
	}
	return obj;
}

export function elementPropInHierarcy(element, prop) {
	const el = eachElementInHierarchy(element, (el) => getDeep(el, prop) !== undefined);
	return getDeep(el, prop);
}

export function eachElementInHierarchy(element, fn) {
	while (element && !fn(element)) {
		element = element.parentElement;
	}
	return element;
}

export function debounce(func, wait) {
	if (!wait) {
		return func;
	}
	let timeout;
	return function() {
		const context = this;
		const args = arguments;
		clearTimeout(timeout);
		timeout = setTimeout(() => {
			timeout = null;
			func.apply(context, args);
		}, wait);
	};
}
