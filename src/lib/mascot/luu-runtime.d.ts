export type LuuPose = 'drained' | 'thinking' | 'confused' | 'celebrating';
export function createLuu(svg: SVGSVGElement, options?: {pose?:LuuPose;reducedMotion?:boolean;staticOnly?:boolean}): {setPose(pose:LuuPose):void;destroy():void};
