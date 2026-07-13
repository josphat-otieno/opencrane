/** Returns a new list with the id removed if present, or appended if absent. */
export function _ToggleId(list: string[], id: string): string[]
{
	return list.includes(id)
		? list.filter(function keep(value: string): boolean { return value !== id; })
		: [...list, id];
}
