# Robot Web Assembly 🤖🧩

Not WebAssembly the runtime. Robot assembly on the web, literally.

🤖 walks into a browser; an assembled robot walks out. 🧩

Keep your ROS graph modular. Let the browser snap the robot together.

Robot Web Assembly lets each robot part keep publishing its own
`robot_description` and `joint_states`; the web viewer discovers those live
topics, loads the URDFs, streams joint motion, resolves `package://...` meshes,
and composes the scene in Three.js.

Use it when you want a live robot webviz without publishing a merged URDF, adding
static TF just for visualization, or building a one-off frontend for every robot
combination.

## Demo

| Desktop | Mobile |
| --- | --- |
| ![Desktop demo](docs/desktop-demo.gif) | ![Mobile demo](docs/mobile-demo.gif) |

## Features

- 🚀 ROS 2 launch file that starts the web viewer, `rosbridge_websocket`, and
  `rosapi_node`
- 🔌 Editable rosbridge WebSocket URL in the browser
- 🛰️ Automatic live topic discovery and refresh through `rosapi_node`
- 🧩 Multiple URDF models in one browser scene
- 🦾 Optional `sensor_msgs/msg/JointState` playback per model
- 📐 Browser-side mount rules for composing independently published robot parts
- 📦 `package://...` mesh loading through the included package asset server
- 🪶 No Node.js build step required for the bundled web app

## Requirements

- ROS 2
- `rosbridge_server`
- `rosapi`
- `ament_index_python`
- A browser with WebGL support

The browser UI currently loads JavaScript libraries from jsDelivr CDN:
`roslib`, `three`, `urdf-loader`, and `lucide`.

## Topic Expectations

The viewer discovers and filters topics from the active ROS graph:

- URDF description topics: `std_msgs/msg/String` topics whose names include
  `robot_description`
- Joint state topics: `sensor_msgs/msg/JointState` topics

If your URDF or joint states use different topic types or naming conventions,
adapt the frontend filters in `web/app.js`.

## Browser-Side Assembly

The viewer can load several URDF descriptions at once and keep each model bound
to its own joint state topic. Mounts are computed only inside the browser:
the app takes a parent part link, the child part's configured mount link, and a
mount origin, then places the child model in the Three.js scene.

This is intended for visualization, remote inspection, and mount offset tuning.
It does not publish a merged `robot_description`, and it does not create ROS TF
frames for the assembled model.

## Preset Configuration

Assembly presets are loaded from:

```text
web/config/assembly-presets.json
```

Each preset contains a `label` and `parts`. A part can declare the expected
URDF `robotName`, its own `mountLink` when it is mountable, default topic
names, topic candidates, links to hide after its URDF is loaded, and optional
child `mounts`. The viewer ignores a URDF message when its top-level
`<robot name="...">` does not match the configured `robotName`.

Mounts live under the parent part. Each mount declares the parent
link, child part, and editable mount `origin`. The child part supplies its own
mount link.

The browser fetches this file at startup, so adding or changing presets does not
require editing `web/app.js`.

## Build

```bash
cd <your_ros2_ws>
rosdep install --from-paths src --ignore-src -r -y
colcon build --packages-select robot_web_assembly
source install/setup.bash
```

## Run

```bash
ros2 launch robot_web_assembly viewer.launch.py
```

Open:

```text
http://localhost:8080
```

The launch starts:

- the viewer and mesh asset server on `web_host` / `web_port` (`0.0.0.0:8080`)
- `rosbridge_websocket` on `rosbridge_port` (`9090`)
- `rosapi_node` for topic discovery

The browser websocket field defaults to the launched rosbridge endpoint,
derived from the page host and `rosbridge_port`. You can edit that URL in the
viewer before connecting.

The topic selectors are automatically populated and refreshed from the current
ROS graph through `rosapi_node`.

## Launch Arguments

| Argument | Default | Description |
| --- | --- | --- |
| `web_host` | `0.0.0.0` | HTTP bind host for the viewer and package asset server. |
| `web_port` | `8080` | HTTP port for the viewer and package asset server. |
| `rosbridge_port` | `9090` | WebSocket port passed to `rosbridge_websocket`. |

Example:

```bash
ros2 launch robot_web_assembly viewer.launch.py \
  web_host:=0.0.0.0 \
  web_port:=8080 \
  rosbridge_port:=9090
```

## Mesh Path Handling

The web app maps URDF mesh URLs like:

```text
package://example_robot_description/meshes/base_link.dae
```

to:

```text
http://localhost:8080/packages/example_robot_description/meshes/base_link.dae
```

The package asset server resolves package share directories through
`ament_index_python`, so build and source your ROS 2 environment before
launching.

## Troubleshooting

### The topic dropdowns are empty

Check that `rosapi_node` is running and the browser is connected to the correct
rosbridge WebSocket URL. The ROS status in the side panel should show `online`.

Also confirm that the URDF topic is a `std_msgs/msg/String` topic with
`robot_description` in its name.

### URDF stays on subscribed

Some `robot_description` publishers send the description once with transient
local QoS. If the browser subscription does not receive that latched message,
the viewer asks `rosapi` for the topic publishers and tries to read each
publisher's `robot_description` parameter as a fallback.

If the part still does not load, check that the publishing node exposes a
`robot_description` parameter and that `rosapi_node` can access parameters.

### The robot appears, but meshes are missing

Open the browser developer console and look for failed `/packages/...` requests.
The package containing the meshes must be discoverable through the sourced ROS 2
environment on the machine running the viewer server.

### Joint motion is not updating

Select a `sensor_msgs/msg/JointState` topic from the Joint states dropdown and
verify that the joint names match the names in the URDF.

## Development

Run the package tests with:

```bash
pytest -q src/robot_web_assembly/tests
```

Or through colcon:

```bash
colcon test --packages-select robot_web_assembly
```

## License

MIT
