/* @flow */

declare interface etch$Component<Props> {
  props: Props;
}

declare class etch$Element<Props> {
  type: etch$Component<Props>;
  props: Props;
}

declare type etch$Node =
  | void | null
  | boolean | number | string
  | etch$Element<any>
  | Iterable<etch$Node>;

declare module 'etch' {
  declare function dom<Props>(type: Class<etch$Component<Props>>, props: Props, ...children?: etch$Node[]): etch$Element<Props>;
  declare function dom(type: string, props: ?Object, ...children?: etch$Node[]): etch$Element<Object>;

  declare var initialize: (...args: any[]) => void
  declare var update: (...args: any[]) => Promise<any>
  declare var destroy: (...args: any[]) => void
  declare var getScheduler: () => any
  declare var setScheduler: (...args: any[]) => void
}
