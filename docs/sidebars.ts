import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

/**
 * Frontend variant of the shared warehouse-systems layout: no DDD pack, no API
 * reference (the web app has no bounded-context model or API of its own).
 */
const sidebars: SidebarsConfig = {
  docsSidebar: [
    {
      type: 'category',
      label: 'Overview',
      collapsed: false,
      link: {type: 'doc', id: 'overview/introduction'},
      items: ['overview/architecture', 'overview/quickstart'],
    },
    {
      type: 'category',
      label: 'Operations',
      items: ['operations/configuration', 'operations/runbook', 'operations/troubleshooting'],
    },
    {
      type: 'category',
      label: 'Development',
      items: ['development/testing'],
    },
    {
      type: 'category',
      label: 'Ecosystem',
      items: ['ecosystem/integration'],
    },
    {
      type: 'category',
      label: 'Architecture Decision Records',
      items: [
        {
          type: 'link',
          label: 'ADR index',
          href: '/docs/adr',
        },
        {
          type: 'link',
          label: '0001 React Router 7 framework mode with SSR on Node',
          href: '/docs/adr/0001-react-router-7-framework-ssr',
        },
        {
          type: 'link',
          label: '0002 The web app talks only to the BFF and never invents ids',
          href: '/docs/adr/0002-bff-only-and-state-cookie',
        },
        {
          type: 'link',
          label: '0003 Strict Content-Security-Policy',
          href: '/docs/adr/0003-strict-csp',
        },
        {
          type: 'link',
          label: '0004 Simulated hosted payment fields',
          href: '/docs/adr/0004-simulated-payment-fields',
        },
        {
          type: 'link',
          label: '0005 CI sensors and the stub BFF',
          href: '/docs/adr/0005-ci-sensors-and-stub-bff',
        },
        {
          type: 'link',
          label: '0006 Promise windows are shown in the destination\'s time zone',
          href: '/docs/adr/0006-promise-windows-in-the-destination-time-zone',
        },
        {
          type: 'link',
          label: '0007 Adopt the fleet REST API guideline',
          href: '/docs/adr/0007-adopt-the-fleet-rest-api-guideline',
        },
      ],
    },
  ],
};

export default sidebars;
