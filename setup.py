from pathlib import Path

from setuptools import find_packages, setup


package_name = "robot_web_assembly"
project_root = Path(__file__).resolve().parent


def package_files(source_dir: Path, install_dir: str):
    if not source_dir.exists():
        return []

    packaged = []
    for path in sorted(source_dir.rglob("*")):
        if (
            path.is_file()
            and "__pycache__" not in path.parts
            and path.suffix != ".pyc"
        ):
            destination = Path(install_dir) / path.parent.relative_to(source_dir)
            packaged.append((str(destination), [str(path.relative_to(project_root))]))
    return packaged


setup(
    name=package_name,
    version="0.1.0",
    packages=find_packages(exclude=["tests"]),
    data_files=[
        (
            "share/ament_index/resource_index/packages",
            [f"resource/{package_name}"],
        ),
        (f"share/{package_name}", ["package.xml", "LICENSE"]),
        *package_files(project_root / "launch", f"share/{package_name}/launch"),
        *package_files(project_root / "web", f"share/{package_name}/web"),
    ],
    install_requires=["setuptools"],
    zip_safe=True,
    maintainer="shkwon98",
    maintainer_email="shkwon98@snu.ac.kr",
    description="Live browser-side robot assembly and URDF visualization for ROS 2.",
    license="MIT",
    extras_require={"test": ["pytest"]},
    entry_points={
        "console_scripts": [
            "robot_web_assembly_server = robot_web_assembly.run_server:main",
        ],
    },
)
