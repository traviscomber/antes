import type { OperationalGraph } from "@/lib/operational-graph/types";

const ORGANIZATION_ID = "synthetic-beverage-chile";

export const syntheticBeverageGraph = {
  organizationId: ORGANIZATION_ID,
  dataMode: "synthetic_demo",
  nodes: [
    {
      id: "demo.port.san-antonio",
      organizationId: ORGANIZATION_ID,
      nodeType: "port",
      name: "Puerto de entrada — San Antonio",
      geography: {
        country: "CL",
        region: "Valparaíso",
        commune: "San Antonio",
      },
      attributes: {
        synthetic: true,
        role: "import_gateway",
      },
    },
    {
      id: "demo.material.imported-packaging",
      organizationId: ORGANIZATION_ID,
      nodeType: "material",
      name: "Material de envase importado",
      signalBindings: [
        {
          sourceId: "cl.bcch.bde",
          signalType: "economy.fx.usd_clp",
          reason: "Synthetic demo material is explicitly modeled as USD-exposed.",
        },
      ],
      attributes: {
        synthetic: true,
        pricingCurrency: "USD",
        criticality: "high",
      },
    },
    {
      id: "demo.plant.metropolitana",
      organizationId: ORGANIZATION_ID,
      nodeType: "plant",
      name: "Planta Demo Metropolitana",
      geography: {
        country: "CL",
        region: "Metropolitana de Santiago",
        commune: "Maipú",
      },
      attributes: {
        synthetic: true,
      },
    },
    {
      id: "demo.sku.500ml",
      organizationId: ORGANIZATION_ID,
      nodeType: "sku",
      name: "SKU Demo 500 ml",
      attributes: {
        synthetic: true,
        family: "beverage",
      },
    },
    {
      id: "demo.dc.metropolitana",
      organizationId: ORGANIZATION_ID,
      nodeType: "distribution_center",
      name: "CD Demo Metropolitana",
      geography: {
        country: "CL",
        region: "Metropolitana de Santiago",
        commune: "Quilicura",
      },
      attributes: {
        synthetic: true,
      },
    },
  ],
  edges: [
    {
      id: "demo.edge.port-material",
      organizationId: ORGANIZATION_ID,
      fromNodeId: "demo.port.san-antonio",
      toNodeId: "demo.material.imported-packaging",
      edgeType: "enters_country_through",
      propagatesRisk: true,
      attributes: { synthetic: true },
    },
    {
      id: "demo.edge.material-plant",
      organizationId: ORGANIZATION_ID,
      fromNodeId: "demo.material.imported-packaging",
      toNodeId: "demo.plant.metropolitana",
      edgeType: "required_by",
      propagatesRisk: true,
      attributes: { synthetic: true },
    },
    {
      id: "demo.edge.plant-sku",
      organizationId: ORGANIZATION_ID,
      fromNodeId: "demo.plant.metropolitana",
      toNodeId: "demo.sku.500ml",
      edgeType: "produces",
      propagatesRisk: true,
      attributes: { synthetic: true },
    },
    {
      id: "demo.edge.sku-dc",
      organizationId: ORGANIZATION_ID,
      fromNodeId: "demo.sku.500ml",
      toNodeId: "demo.dc.metropolitana",
      edgeType: "distributed_through",
      propagatesRisk: true,
      attributes: { synthetic: true },
    },
  ],
} satisfies OperationalGraph;
