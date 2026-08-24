import type { OperationalGraph } from "@/lib/operational-graph/types";

const ORGANIZATION_ID = "test-org";

export const testOperationalGraph: OperationalGraph = {
  organizationId: ORGANIZATION_ID,
  nodes: [
    {
      id: "test.port.san-antonio",
      organizationId: ORGANIZATION_ID,
      nodeType: "port",
      name: "Test port",
      geography: {
        country: "CL",
        region: "Valparaíso",
        commune: "San Antonio",
      },
      attributes: { role: "import_gateway" },
    },
    {
      id: "test.material.imported-packaging",
      organizationId: ORGANIZATION_ID,
      nodeType: "material",
      name: "Test imported material",
      signalBindings: [
        {
          sourceId: "cl.bcch.bde",
          signalType: "economy.fx.usd_clp",
          reason: "Test fixture models a material with explicit USD exposure.",
        },
      ],
      attributes: {
        pricingCurrency: "USD",
        criticality: "high",
      },
    },
    {
      id: "test.plant.metropolitana",
      organizationId: ORGANIZATION_ID,
      nodeType: "plant",
      name: "Test plant",
      geography: {
        country: "CL",
        region: "Metropolitana de Santiago",
        commune: "Maipú",
      },
      attributes: {},
    },
    {
      id: "test.sku.500ml",
      organizationId: ORGANIZATION_ID,
      nodeType: "sku",
      name: "Test SKU",
      attributes: { family: "beverage" },
    },
    {
      id: "test.dc.metropolitana",
      organizationId: ORGANIZATION_ID,
      nodeType: "distribution_center",
      name: "Test distribution center",
      geography: {
        country: "CL",
        region: "Metropolitana de Santiago",
        commune: "Quilicura",
      },
      attributes: {},
    },
  ],
  edges: [
    {
      id: "test.edge.port-material",
      organizationId: ORGANIZATION_ID,
      fromNodeId: "test.port.san-antonio",
      toNodeId: "test.material.imported-packaging",
      edgeType: "enters_country_through",
      propagatesRisk: true,
      attributes: {},
    },
    {
      id: "test.edge.material-plant",
      organizationId: ORGANIZATION_ID,
      fromNodeId: "test.material.imported-packaging",
      toNodeId: "test.plant.metropolitana",
      edgeType: "required_by",
      propagatesRisk: true,
      attributes: {},
    },
    {
      id: "test.edge.plant-sku",
      organizationId: ORGANIZATION_ID,
      fromNodeId: "test.plant.metropolitana",
      toNodeId: "test.sku.500ml",
      edgeType: "produces",
      propagatesRisk: true,
      attributes: {},
    },
    {
      id: "test.edge.sku-dc",
      organizationId: ORGANIZATION_ID,
      fromNodeId: "test.sku.500ml",
      toNodeId: "test.dc.metropolitana",
      edgeType: "distributed_through",
      propagatesRisk: true,
      attributes: {},
    },
  ],
};
