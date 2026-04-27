from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node
from launch_ros.parameter_descriptions import ParameterValue


def generate_launch_description():
    web_host = LaunchConfiguration("web_host")
    web_port = LaunchConfiguration("web_port")
    rosbridge_port = LaunchConfiguration("rosbridge_port")

    return LaunchDescription(
        [
            DeclareLaunchArgument(
                "web_host",
                default_value="0.0.0.0",
                description="HTTP host for the viewer and package asset server.",
            ),
            DeclareLaunchArgument(
                "web_port",
                default_value="8080",
                description="HTTP port for the viewer and package asset server.",
            ),
            DeclareLaunchArgument(
                "rosbridge_port",
                default_value="9090",
                description="rosbridge websocket port.",
            ),
            Node(
                package="rosbridge_server",
                executable="rosbridge_websocket",
                name="rosbridge_websocket",
                output="screen",
                parameters=[
                    {"port": ParameterValue(rosbridge_port, value_type=int)}
                ],
            ),
            Node(
                package="rosapi",
                executable="rosapi_node",
                output="screen",
            ),
            Node(
                package="robot_web_assembly",
                executable="robot_web_assembly_server",
                output="screen",
                arguments=[
                    "--host",
                    web_host,
                    "--port",
                    web_port,
                    "--rosbridge-port",
                    rosbridge_port,
                ],
            ),
        ]
    )
