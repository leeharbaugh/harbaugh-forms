import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractCountyFromMapboxContext,
  extractCountyFromMapboxFeature,
  parseMapboxRetrieveResponse,
} from "./mapbox-address.ts";
import type { AddressAutofillRetrieveResponse } from "@mapbox/search-js-core";

describe("extractCountyFromMapboxContext", () => {
  it("returns district text from Address Autofill array context", () => {
    const county = extractCountyFromMapboxContext([
      { id: "country.1", text: "United States" },
      { id: "region.1", text: "Texas" },
      { id: "district.1", text: "Tarrant County", mapbox_id: "tarrant" },
      { id: "place.1", text: "Fort Worth" },
      { id: "neighborhood.1", text: "Westcliff" },
    ]);

    assert.equal(county, "Tarrant");
  });

  it("returns district name from Search Box object context", () => {
    const county = extractCountyFromMapboxContext({
      country: { name: "United States" },
      region: { name: "Texas" },
      district: { name: "Dallas County", mapbox_id: "dallas" },
      place: { name: "Dallas" },
      neighborhood: { name: "Downtown" },
    });

    assert.equal(county, "Dallas");
  });

  it("does not use neighborhood, locality, or place as county", () => {
    assert.equal(
      extractCountyFromMapboxContext([
        { id: "neighborhood.1", text: "Oak Hill" },
        { id: "locality.1", text: "Midlothian" },
        { id: "place.1", text: "Mansfield" },
      ]),
      undefined,
    );
  });

  it("does not use the first matching context item", () => {
    assert.equal(
      extractCountyFromMapboxContext([
        { id: "place.1", text: "Cleburne" },
        { id: "region.1", text: "Texas" },
      ]),
      undefined,
    );
  });

  it("returns undefined when district is missing", () => {
    assert.equal(extractCountyFromMapboxContext(null), undefined);
    assert.equal(extractCountyFromMapboxContext(undefined), undefined);
    assert.equal(extractCountyFromMapboxContext([]), undefined);
    assert.equal(extractCountyFromMapboxContext({}), undefined);
  });

  it("accepts district ids without a suffix", () => {
    assert.equal(
      extractCountyFromMapboxContext([
        { id: "district", text: "Tarrant County" },
      ]),
      "Tarrant",
    );
  });

  it("accepts district as a string in object context", () => {
    assert.equal(
      extractCountyFromMapboxContext({
        district: "Ellis County",
      }),
      "Ellis",
    );
  });
});

describe("extractCountyFromMapboxFeature", () => {
  it("extracts Texas county fixtures for Tarrant, Dallas, Johnson, and Ellis", () => {
    const fixtures = [
      {
        label: "Tarrant",
        feature: {
          properties: {
            address_level3: "Westcliff",
            context: [
              { id: "district.tarrant", text: "Tarrant County" },
              { id: "neighborhood.1", text: "Westcliff" },
            ],
          },
        },
      },
      {
        label: "Dallas",
        feature: {
          properties: {
            address_level3: "Oak Lawn",
            context: {
              district: { name: "Dallas County" },
              neighborhood: { name: "Oak Lawn" },
            },
          },
        },
      },
      {
        label: "Johnson",
        feature: {
          properties: {
            address_level3: "Downtown Cleburne",
            context: [{ id: "district.johnson", text: "Johnson County" }],
          },
        },
      },
      {
        label: "Ellis",
        feature: {
          properties: {
            address_level3: "Old Town",
            context: [{ id: "district.ellis", text: "Ellis County" }],
          },
        },
      },
    ];

    for (const fixture of fixtures) {
      assert.equal(
        extractCountyFromMapboxFeature(fixture.feature),
        fixture.label,
        fixture.label,
      );
    }
  });

  it("ignores address_level3 subdivision values", () => {
    assert.equal(
      extractCountyFromMapboxFeature({
        properties: {
          address_level3: "Kessler Park",
          context: [{ id: "neighborhood.1", text: "Kessler Park" }],
        },
      }),
      undefined,
    );
  });

  it("does not treat Arlington Meadows as a county", () => {
    assert.equal(
      extractCountyFromMapboxFeature({
        properties: {
          address_level3: "Arlington Meadows",
          address_level2: "Arlington",
          context: [
            { id: "place.1", text: "Arlington" },
            { id: "neighborhood.1", text: "Arlington Meadows" },
          ],
        },
      }),
      undefined,
    );
  });

  it("reads district from feature-level context when properties.context is missing", () => {
    assert.equal(
      extractCountyFromMapboxFeature({
        properties: {
          address_level3: "Arlington Meadows",
        },
        context: [{ id: "district.tarrant", text: "Tarrant County" }],
      }),
      "Tarrant",
    );
  });
});

describe("parseMapboxRetrieveResponse", () => {
  it("maps county only from district context", () => {
    const response = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [-97.33, 32.75] },
          properties: {
            address_line1: "100 Main St",
            address_level1: "TX",
            address_level2: "Fort Worth",
            address_level3: "Westcliff",
            postcode: "76109",
            context: [{ id: "district.tarrant", text: "Tarrant County" }],
          },
        },
      ],
    } as AddressAutofillRetrieveResponse;

    assert.deepEqual(parseMapboxRetrieveResponse(response), {
      line1: "100 Main St",
      line2: undefined,
      city: "Fort Worth",
      state: "TX",
      zip: "76109",
      county: "Tarrant",
    });
  });

  it("omits county when district is unavailable", () => {
    const response = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [-96.8, 32.78] },
          properties: {
            address_line1: "200 Elm St",
            address_level1: "TX",
            address_level2: "Dallas",
            address_level3: "Deep Ellum",
            postcode: "75226",
            context: [{ id: "neighborhood.1", text: "Deep Ellum" }],
          },
        },
      ],
    } as AddressAutofillRetrieveResponse;

    assert.equal(parseMapboxRetrieveResponse(response)?.county, undefined);
  });
});
