// TODO Design#2 : catégorisation des armes Valorant pour WeaponGlyph.tsx — Henrik ne fournit
// qu'un nom d'arme (economy.weapon.name), jamais une catégorie ; table statique à mettre à
// jour manuellement si Riot ajoute une arme (même limite que agentRoles.ts pour les rôles).

export type WeaponCategory = "sidearm" | "smg" | "shotgun" | "rifle" | "sniper" | "heavy" | "melee";

const CATEGORY_BY_WEAPON_NAME: Record<string, WeaponCategory> = {
  classic: "sidearm",
  shorty: "sidearm",
  frenzy: "sidearm",
  ghost: "sidearm",
  sheriff: "sidearm",
  stinger: "smg",
  spectre: "smg",
  bucky: "shotgun",
  judge: "shotgun",
  bulldog: "rifle",
  guardian: "rifle",
  phantom: "rifle",
  vandal: "rifle",
  marshal: "sniper",
  outlaw: "sniper",
  operator: "sniper",
  ares: "heavy",
  odin: "heavy",
  melee: "melee",
  knife: "melee",
};

export function weaponCategory(weaponName: string | null | undefined): WeaponCategory | null {
  if (!weaponName) return null;
  return CATEGORY_BY_WEAPON_NAME[weaponName.trim().toLowerCase()] ?? null;
}
