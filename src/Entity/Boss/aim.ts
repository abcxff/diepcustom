import { AIState } from "../AI";

interface BossAimLike {
    ai: {
        state: AIState;
        passiveRotation: number;
        inputs: {
            mouse: {
                x: number;
                y: number;
            };
        };
    };
    positionData: {
        angle: number;
        values: {
            x: number;
            y: number;
        };
    };
    setVelocity(x: number, y: number): void;
}

export const applyIdleSpinOrTrackTarget = (boss: BossAimLike): void => {
    if (boss.ai.state === AIState.idle) {
        boss.positionData.angle += boss.ai.passiveRotation;
        boss.setVelocity(0, 0);
        return;
    }

    const { x, y } = boss.positionData.values;
    boss.positionData.angle = Math.atan2(boss.ai.inputs.mouse.y - y, boss.ai.inputs.mouse.x - x);
};
