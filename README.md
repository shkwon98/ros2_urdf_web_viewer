# ROS 2 URDF Web Viewer

Browser-based URDF visualization for ROS 2 systems. The viewer connects to ROS
through rosbridge, discovers available topics through rosapi, loads URDF XML
from a selected topic, and resolves `package://...` mesh paths through a small
HTTP asset server.

It is designed for quickly inspecting robot descriptions and joint states from
a browser without building a custom frontend for each robot.

## Features

- ROS 2 launch file that starts the web viewer, `rosbridge_websocket`, and
  `rosapi_node`
- Editable rosbridge WebSocket URL in the browser
- Automatic topic discovery and refresh through `rosapi_node`
- URDF rendering with Three.js and `urdf-loader`
- Optional `sensor_msgs/msg/JointState` playback for live joint motion
- `package://...` mesh loading through the included package asset server
- No Node.js build step required for the bundled web app

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

## Build

```bash
cd <your_ros2_ws>
rosdep install --from-paths src --ignore-src -r -y
colcon build --packages-select ros2_urdf_web_viewer
source install/setup.bash
```

## Run

```bash
ros2 launch ros2_urdf_web_viewer viewer.launch.py
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
ros2 launch ros2_urdf_web_viewer viewer.launch.py \
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
pytest -q src/ros2_urdf_web_viewer/tests
```

Or through colcon:

```bash
colcon test --packages-select ros2_urdf_web_viewer
```

## License

MIT
