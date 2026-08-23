export type FavoriteStation = { id: string; name: string };

export function toggleFavorite<T extends FavoriteStation>(favorites: T[], station: T): T[] {
  return favorites.some((favorite) => favorite.id === station.id)
    ? favorites.filter((favorite) => favorite.id !== station.id)
    : [station, ...favorites];
}
