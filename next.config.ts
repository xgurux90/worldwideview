import type { NextConfig } from "next";
import path from "path";
import webpack from "webpack";
import CopyPlugin from "copy-webpack-plugin";

const cesiumSource = path.resolve(__dirname, "node_modules/cesium/Build/Cesium");

const nextConfig: NextConfig = {
  env: {
    CESIUM_BASE_URL: "/cesium",
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Copy Cesium static assets to public/cesium in production builds
      // (in dev, the predev script copies them instead)
      if (process.env.NODE_ENV === "production") {
        config.plugins?.push(
          new CopyPlugin({
            patterns: ["Workers", "ThirdParty", "Assets", "Widgets"].map((dir) => ({
              from: path.join(cesiumSource, dir),
              to: path.resolve(__dirname, "public/cesium", dir),
            })),
          })
        );
      }

      // Define CESIUM_BASE_URL for Cesium's worker resolution
      config.plugins?.push(
        new webpack.DefinePlugin({
          CESIUM_BASE_URL: JSON.stringify("/cesium"),
        })
      );

      // Cesium uses some Node.js modules that should be excluded in the browser
      config.resolve = config.resolve || {};
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        http: false,
        https: false,
        zlib: false,
        url: false,
      };
    }

    return config;
  },
};

export default nextConfig;
