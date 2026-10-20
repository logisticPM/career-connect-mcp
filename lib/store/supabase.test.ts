import { describe, expect, it } from "vitest";
import { contactToRow, rowToContact } from "./supabase";

describe("contact row mapping", () => {
  it("maps camelCase fields to snake_case columns and drops undefined", () => {
    expect(contactToRow({ name: "Sam", linkedinUrl: "https://x", nurtureIdeas: "Article", title: undefined })).toEqual({
      name: "Sam",
      linkedin_url: "https://x",
      nurture_ideas: "Article",
    });
  });

  it("never writes id, user_id or timestamps", () => {
    const row = contactToRow({ name: "Sam", ...({ id: "x", user_id: "y", createdAt: "z" } as object) });
    expect(row).toEqual({ name: "Sam" });
  });

  it("maps rows back and omits null columns", () => {
    expect(
      rowToContact({
        id: "1",
        user_id: "u",
        name: "Sam",
        contact_type: "Alum",
        email: null,
        status: "Met",
        created_at: "2026-10-20T00:00:00Z",
        updated_at: "2026-10-20T00:00:00Z",
      }),
    ).toEqual({
      id: "1",
      name: "Sam",
      contactType: "Alum",
      status: "Met",
      createdAt: "2026-10-20T00:00:00Z",
      updatedAt: "2026-10-20T00:00:00Z",
    });
  });
});
