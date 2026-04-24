import _ from 'underscore';

import type { History, Location } from 'history';
import { createPath } from 'history';
import qs, { type ParsedQs } from 'qs';

type HashLocation = Pick<Location, 'hash'>;
type HistoryStepParams = Record<string, unknown>;

class Utils {

	//Finds y value of given object
	static findPosY(obj: HTMLElement) {
		let curtop = 0;
		let current: HTMLElement | null = obj;
		if (current.offsetParent) {
			do {
				curtop += current.offsetTop;
				current = current.offsetParent as HTMLElement | null;
			} while (current);
			return [curtop];
		}
	}

	static findPosX(obj: HTMLElement) {
		let curleft = 0;
		let current: HTMLElement | null = obj;
		if (current.offsetParent) {
			do {
				curleft += current.offsetLeft;
				current = current.offsetParent as HTMLElement | null;
			} while (current);
			return [curleft];
		}
	}

	static makePath(...args: Array<string | undefined>) {
		return args.reduce(
			(acc, frag) =>
				frag
					? acc + (acc.endsWith("/") || frag.startsWith("/") ? "" : "/") + frag
					: acc
		);
	}

	static getCleanHash(hash: string) {
		return hash.startsWith("#") ? hash.substring(1) : hash;
	}

	static getConfigFromLocation(location: HashLocation): ParsedQs {
		return qs.parse(this.getCleanHash(location.hash));
	}

	static pushHistoryStep(history: History, newParams: HistoryStepParams, omitedParams?: string[]) {
		const currentParams = this.getConfigFromLocation(history.location);
		const updStrParams = qs.stringify(_.omit(_.extend(currentParams, newParams), omitedParams));
		const updatedPath = createPath(_.extend(_.clone(history.location), { hash: updStrParams }));
		if (updStrParams !== this.getCleanHash(history.location.hash)) {
			history.push(updatedPath);
		}
	}

}

export default Utils;
