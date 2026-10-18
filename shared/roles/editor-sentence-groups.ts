import type { RecordingForm } from './recording.js';
// These source entries list alternative outcomes, rather than consecutive lines.
// Keep the source branch ID; result variants are editable configuration beneath it.
const alternatives = new Set([
    'T006-B02', 'T011-B01', 'T022-B01', 'T026-B01', 'T048-B02', 'T066-B02', 'T083-B01', 'T094-B02',
    'O014-B02', 'M005-B03', 'M007-B01', 'M009-B02', 'M015-B02', 'M020-B01', 'M034-B02',
    'D001-B01', 'D002-B01', 'D004-B02', 'D005-B01', 'D006-B02', 'D007-B02', 'D008-B02', 'D009-B01',
    'D011-B02', 'D011-B03', 'D014-B02', 'D016-B01', 'D017-B02', 'D019-B02', 'D020-B01', 'D021-B02',
    'D022-B02', 'D024-B01', 'D025-B02', 'D026-B01', 'D027-B01', 'D027-B02',
]);
const mixed: Record<string, number[][]> = {
    'T052-B02': [[0, 2], [1]],
    'O011-B01': [[0, 1, 2], [3]],
    'M012-B01': [[0, 2], [0, 1, 2]],
    'M031-B02': [[0, 1], [0, 1, 2]],
    'D012-B02': [[0], [0, 1]],
    'T096-B02': [[0], [0, 1]],
};
export function sentenceGroups(form: RecordingForm): string[][] {
    const code = form.branchId.replace('S001-R-', '');
    if (mixed[code])
        return mixed[code].map(indices => indices.map(i => form.sentences[i]));
    if (!alternatives.has(code))
        return [form.sentences];
    const details = form.sentences.filter(s => /^（可选详细|^详细说明/.test(s));
    return form.sentences.filter(s => !details.includes(s)).map(s => [s, ...details]);
}
export function sentenceLabel(lines: string[], index: number, code: string): string {
    if (code === 'S001-R-T006-B02')
        return ['得知有恶魔', '因查验到干扰项而得知有恶魔', '得知没有恶魔'][index];
    if (lines.length > 1 && index > 0)
        return `结果${index + 1} · 附带后续记录`;
    return lines[0].replace(/【([^】]+)】/g, '$1').slice(0, 120);
}
