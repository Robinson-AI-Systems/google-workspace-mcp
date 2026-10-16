// Directory Building.floorNames must contain at least one entry.
// https://developers.google.com/workspace/admin/directory/reference/rest/v1/resources.buildings
export function buildingCreateBody(args) {
  if (!Array.isArray(args.floorNames) || args.floorNames.length === 0 ||
      args.floorNames.some(name => typeof name !== 'string' || !name.trim())) {
    throw new Error('floorNames must contain at least one nonempty floor name.');
  }
  return { buildingId: args.buildingId, buildingName: args.buildingName,
    floorNames: args.floorNames, address: args.address };
}
