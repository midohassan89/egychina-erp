export interface PackageUnitSource {
  id: string;
  name: string;
  nameEn: string | null;
  nameZh: string | null;
  barcode: string;
  packSize: number;
  price: number | null;
}

/** Mobile and web package list. `packSize` is the conversion factor. */
export function productUnits(packages: PackageUnitSource[]) {
  return packages.map((row) => ({
    id: row.id,
    name: row.name,
    nameEn: row.nameEn,
    nameZh: row.nameZh,
    barcode: row.barcode,
    price: row.price,
    packSize: row.packSize,
    factor: row.packSize,
  }));
}
