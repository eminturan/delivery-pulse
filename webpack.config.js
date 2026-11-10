const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");

// Dashboard widget'ı ve ayar paneli; her biri kendi sayfasında yüklenir.
const WIDGET_PAGES = ["summary-widget", "summary-config"];

module.exports = (env, argv) => ({
  entry: {
    hub: "./src/hub/hub.tsx",
    ...Object.fromEntries(WIDGET_PAGES.map((name) => [name, `./src/widget/${name}.tsx`])),
  },
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "[name]/[name].js",
    clean: true,
  },
  resolve: {
    extensions: [".ts", ".tsx", ".js"],
    // SDK'nın tek bir kopyasının yüklenmesini garanti eder.
    alias: {
      "azure-devops-extension-sdk": path.resolve(__dirname, "node_modules/azure-devops-extension-sdk"),
    },
  },
  module: {
    rules: [
      { test: /\.tsx?$/, loader: "ts-loader", options: { transpileOnly: true } },
      { test: /\.css$/, use: ["style-loader", "css-loader"] },
      { test: /\.(woff2?|ttf|eot|png|svg)$/, type: "asset/inline" },
    ],
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: "src/hub/hub.html", to: "hub/hub.html" },
        ...WIDGET_PAGES.map((name) => ({
          from: "src/widget/page.html",
          to: `${name}/${name}.html`,
          transform: (content) => content.toString().replace("__NAME__", name),
        })),
      ],
    }),
  ],
  devtool: argv.mode === "development" ? "inline-source-map" : false,
  devServer: { port: 3002, hot: false },
  performance: { hints: false },
  stats: "errors-warnings",
});
