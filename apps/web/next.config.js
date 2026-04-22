const createNextIntlPlugin = require("next-intl/plugin");
const withNextIntl = createNextIntlPlugin("./i18n.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: "/monitor",
        headers: [{ key: "X-Robots-Tag", value: "noindex" }],
      },
    ];
  },
};

module.exports = withNextIntl(nextConfig);
