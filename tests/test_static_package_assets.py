from pathlib import Path
import unittest


PACKAGE_ROOT = Path(__file__).resolve().parents[1]


class TestStaticPackageAssets(unittest.TestCase):
    def test_web_entrypoint_loads_required_browser_libraries(self):
        index_html = (PACKAGE_ROOT / "web" / "index.html").read_text(
            encoding="utf-8"
        )

        self.assertIn("ROS 2 URDF Web Viewer", index_html)
        self.assertIn("roslib.min.js", index_html)
        self.assertIn("urdf-loader", index_html)
        self.assertIn("three", index_html)
        self.assertIn("viewer-config.js", index_html)
        self.assertIn("ROS 2 Connection", index_html)
        self.assertIn('id="rosbridge-url"', index_html)
        self.assertIn('placeholder="ws://localhost:9090"', index_html)
        self.assertIn('<select id="robot-description-topic"', index_html)
        self.assertIn('<select id="joint-states-topic"', index_html)
        self.assertNotIn('id="fixed-frame-label"', index_html)
        self.assertNotIn("Frame:", index_html)
        self.assertNotIn('id="refresh-topics-button"', index_html)
        self.assertNotIn("Refresh topics", index_html)
        self.assertNotIn('id="robot-description-topic" type="text"', index_html)
        self.assertNotIn('id="joint-states-topic" type="text"', index_html)

    def test_topic_discovery_refreshes_automatically(self):
        app_js = (PACKAGE_ROOT / "web" / "app.js").read_text(encoding="utf-8")

        self.assertIn("rosbridgeEndpoint", app_js)
        self.assertIn("TOPIC_REFRESH_INTERVAL_MS", app_js)
        self.assertIn("startTopicDiscovery", app_js)
        self.assertIn("stopTopicDiscovery", app_js)
        self.assertIn("setInterval", app_js)
        self.assertIn("rosbridgeUrl", app_js)
        self.assertIn("rosbridgeEndpoint()", app_js)
        self.assertIn("elements.rosbridgeUrl.value.trim()", app_js)
        self.assertNotIn("assetBaseUrl", app_js)
        self.assertNotIn("fixedFrame", app_js)
        self.assertNotIn("fixedFrameLabel", app_js)
        self.assertNotIn("refreshTopicsButton", app_js)

    def test_topic_empty_placeholders_only_render_when_no_topics_exist(self):
        app_js = (PACKAGE_ROOT / "web" / "app.js").read_text(encoding="utf-8")

        self.assertIn("if (topics.length === 0)", app_js)
        self.assertIn("placeholderOption.textContent = placeholder", app_js)
        self.assertIn("return;", app_js)

    def test_launch_file_starts_rosbridge_and_rosapi_unconditionally(self):
        launch_file = (PACKAGE_ROOT / "launch" / "viewer.launch.py").read_text(
            encoding="utf-8"
        )

        self.assertNotIn("start_rosapi", launch_file)
        self.assertNotIn("start_rosbridge", launch_file)
        self.assertNotIn("IfCondition", launch_file)
        self.assertNotIn("IncludeLaunchDescription", launch_file)
        self.assertNotIn("rosbridge_websocket_launch.xml", launch_file)
        self.assertNotIn("FindPackageShare", launch_file)
        self.assertIn('package="rosbridge_server"', launch_file)
        self.assertIn('executable="rosbridge_websocket"', launch_file)
        self.assertIn("ParameterValue(rosbridge_port, value_type=int)", launch_file)
        self.assertIn('package="rosapi"', launch_file)
        self.assertIn('executable="rosapi_node"', launch_file)
        self.assertNotIn("rosbridge_url", launch_file)
        self.assertNotIn("--rosbridge-url", launch_file)
        self.assertNotIn("asset_base_url", launch_file)
        self.assertNotIn("--asset-base-url", launch_file)
        self.assertNotIn("fixed_frame", launch_file)
        self.assertNotIn("--fixed-frame", launch_file)
        self.assertNotIn("robot_description_topic", launch_file)
        self.assertNotIn("joint_states_topic", launch_file)
        self.assertIn("rosbridge_port", launch_file)
        self.assertIn("ros2_urdf_web_viewer_server", launch_file)

    def test_launch_arguments_are_documented_web_host_web_port_rosbridge_port(self):
        launch_file = (PACKAGE_ROOT / "launch" / "viewer.launch.py").read_text(
            encoding="utf-8"
        )
        readme = (PACKAGE_ROOT / "README.md").read_text(encoding="utf-8")

        launch_config_order = [
            launch_file.index('LaunchConfiguration("web_host")'),
            launch_file.index('LaunchConfiguration("web_port")'),
            launch_file.index('LaunchConfiguration("rosbridge_port")'),
        ]
        self.assertEqual(launch_config_order, sorted(launch_config_order))

        launch_argument_order = [
            launch_file.index('                "web_host",'),
            launch_file.index('                "web_port",'),
            launch_file.index('                "rosbridge_port",'),
        ]
        self.assertEqual(launch_argument_order, sorted(launch_argument_order))

        readme_order = [
            readme.index("`web_host`"),
            readme.index("`web_port`"),
            readme.index("`rosbridge_port`"),
        ]
        self.assertEqual(readme_order, sorted(readme_order))

    def test_viewer_launch_does_not_publish_robot_description(self):
        launch_file = (PACKAGE_ROOT / "launch" / "viewer.launch.py").read_text(
            encoding="utf-8"
        )
        package_xml = (PACKAGE_ROOT / "package.xml").read_text(encoding="utf-8")

        self.assertNotIn("robot_state_publisher", launch_file)
        self.assertNotIn("joint_state_publisher_gui", launch_file)
        self.assertNotIn("xacro_file", launch_file)
        self.assertIn("<name>ros2_urdf_web_viewer</name>", package_xml)
        self.assertIn("<exec_depend>rosapi</exec_depend>", package_xml)
        self.assertNotIn("ros2_urdf_web_viewer_example", package_xml)
        self.assertNotIn("<exec_depend>robot_state_publisher</exec_depend>", package_xml)
        self.assertNotIn("<exec_depend>xacro</exec_depend>", package_xml)

    def test_console_entrypoint_uses_run_server_module(self):
        setup_py = (PACKAGE_ROOT / "setup.py").read_text(encoding="utf-8")

        self.assertIn("ros2_urdf_web_viewer.run_server:main", setup_py)
        self.assertNotIn("ros2_urdf_web_viewer.asset_server:main", setup_py)
