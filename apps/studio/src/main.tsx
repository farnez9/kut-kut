import { render } from "solid-js/web";
import { App } from "./App.tsx";

const root = document.getElementById("root");
if (!root) throw new Error("#root element not found");
render(() => <App />, root);
