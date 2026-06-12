export const getAutoSizedArenaDimension = (clientCount: number): number => {
    return Math.floor(25 * Math.sqrt(Math.max(clientCount, 1))) * 100;
};
