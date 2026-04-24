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

    def test_launch_file_exposes_ros_topics_and_ports(self):
        launch_file = (PACKAGE_ROOT / "launch" / "viewer.launch.py").read_text(
            encoding="utf-8"
        )

        self.assertIn("robot_description_topic", launch_file)
        self.assertIn("joint_states_topic", launch_file)
        self.assertIn("rosbridge_port", launch_file)
        self.assertIn("ros2_urdf_web_viewer_server", launch_file)

    def test_viewer_launch_does_not_publish_robot_description(self):
        launch_file = (PACKAGE_ROOT / "launch" / "viewer.launch.py").read_text(
            encoding="utf-8"
        )
        package_xml = (PACKAGE_ROOT / "package.xml").read_text(encoding="utf-8")

        self.assertNotIn("robot_state_publisher", launch_file)
        self.assertNotIn("joint_state_publisher_gui", launch_file)
        self.assertNotIn("xacro_file", launch_file)
        self.assertIn("<name>ros2_urdf_web_viewer</name>", package_xml)
        self.assertNotIn("ros2_urdf_web_viewer_example", package_xml)
        self.assertNotIn("<exec_depend>robot_state_publisher</exec_depend>", package_xml)
        self.assertNotIn("<exec_depend>xacro</exec_depend>", package_xml)
