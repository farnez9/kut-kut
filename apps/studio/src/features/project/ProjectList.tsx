import type { JSX } from "solid-js";
import { For, Show } from "solid-js";
import { useProject } from "./context.ts";

export const ProjectList = (): JSX.Element => {
	const project = useProject();
	return (
		<ul class="project-list">
			<Show
				when={project.available().length > 0}
				fallback={<li class="project-list__empty">No projects yet</li>}
			>
				<For each={project.available()}>
					{(p) => (
						<li>
							<button
								type="button"
								class="project-list__item"
								classList={{ "project-list__item--active": project.selected() === p.name }}
								onClick={() => project.select(p.name)}
							>
								<span class="project-list__dot" aria-hidden="true" />
								<span>{p.name}</span>
							</button>
						</li>
					)}
				</For>
			</Show>
		</ul>
	);
};
