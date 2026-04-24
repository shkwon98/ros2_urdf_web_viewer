# ROS 2 URDF Web Viewer

This package runs a small browser-based URDF viewer backed by:

- `rosbridge_suite` for ROS 2 WebSocket access
- `roslibjs` for browser topic subscriptions
- `three.js` and `urdf-loader` for URDF rendering
- a local HTTP asset server for `package://...` mesh paths

## Build

```bash
cd ~/ros2_ws
colcon build --packages-select ros2_urdf_web_viewer
source install/setup.bash
```

## Run The Viewer

```bash
ros2 launch ros2_urdf_web_viewer viewer.launch.py
```

Open:

```text
http://localhost:8080
```

The launch starts:

- `rosbridge_websocket` on port `9090`
- `rosapi_node` for topic discovery
- the viewer and mesh asset server on port `8080`

It does not publish `robot_description` itself. It subscribes through rosbridge
to whichever ROS 2 topics are selected in the browser. The topic selectors are
automatically populated and refreshed from the current ROS graph through
`rosapi_node`.

For the RBY1 topic layout used elsewhere in this workspace, open the viewer and
select:

- Description: `/control/body/robot_description`
- Joint states: `/sensors/proprio/body/joint_states`

## Use An Existing Robot Pipeline

If rosbridge and rosapi are already running:

```bash
ros2 launch ros2_urdf_web_viewer viewer.launch.py \
  start_rosbridge:=false \
  start_rosapi:=false \
  rosbridge_port:=9090
```

## Mesh Path Handling

The web app maps URDF mesh URLs like:

```text
package://rby1_description/meshes/rby1a/base.dae
```

to:

```text
http://localhost:8080/packages/rby1_description/meshes/rby1a/base.dae
```

The package asset server resolves package share directories through
`ament_index_python`, so build and source the workspace before launching.

## License

MIT
