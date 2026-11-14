import { describe, expect, it } from "vitest";
import { configurationVapidDepuisEnv } from "./envoyeur-web-push";

describe("configurationVapidDepuisEnv", () => {
  const complet = { VAPID_SUBJECT: " mailto:contact@exemple.invalid ", VAPID_PUBLIC_KEY: "pub", VAPID_PRIVATE_KEY: "priv" };

  it("lit les trois variables et retire les espaces", () => {
    expect(configurationVapidDepuisEnv(complet)).toEqual({ sujet: "mailto:contact@exemple.invalid", clePublique: "pub", clePrivee: "priv" });
  });

  it("rend null si une variable manque ou est vide (push désactivé)", () => {
    expect(configurationVapidDepuisEnv({})).toBeNull();
    expect(configurationVapidDepuisEnv({ ...complet, VAPID_PRIVATE_KEY: undefined })).toBeNull();
    expect(configurationVapidDepuisEnv({ ...complet, VAPID_PUBLIC_KEY: "  " })).toBeNull();
    expect(configurationVapidDepuisEnv({ ...complet, VAPID_SUBJECT: "" })).toBeNull();
  });
});
