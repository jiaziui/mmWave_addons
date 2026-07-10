# Reference
接口相关：（设备到传感器侧）
    （传感器+固件）侧接口参考使用：05_Software\home_assistant\Home_Assistant_C4004\Home_Assistant_C4004\README_ENTITY_API.md；
    （传感器+固件）如果接口方面有不明确的，就参考05_Software\home_assistant\Home_Assistant_C4004\Home_Assistant_C4004\dfrobot_c4004；

当前数据存储路径:
    /homeassistant/dfrobot_mmwave/<device_id>/data.json：主要存储数据信息
    /homeassistant/dfrobot_mmwave/<device_id>/device.json：设备详细信息
    /homeassistant/dfrobot_mmwave/devices.json（设备列表）:主要存储数据的基础信息，设备名称、设备ID、设备名称、设备型号、设备制造商、设备固件版本、安装信息、检测模式、绑定时间、更新时间等信息。



# 开发需求
帮我完成 后端功能（开发完部分功能）。详细描述内容如下，其中一些内容你不确定最好跟我确定，觉得不合理的给我解决方案并且跟我确认方案。工程在这个路径下D:\User\lj\DFRobot\Project\module\C4004\C4004\05_Software\home_assistant\mmWave_addons\dfrobot_mmWave\backend

## 详细需求描述：
1.设备绑定:
1.1. 删除设备时，需要删除本地存储的数据文件和数据文件夹（例如，/homeassistant/dfrobot_mmwave/c4004-7eab747c397ab9e23f490c891aa5bef1/）和（/homeassistant/dfrobot_mmwave/devices.json中的文件）

1.2. {
  "version": 1,
  "nextSequence": 3,
  "devices": [
    {
      "deviceNo": "1",
      "id": "c4004-51d49f75bd817da0be7fa9c30a835c03",
      "haDeviceId": "51d49f75bd817da0be7fa9c30a835c03",
      "macAddress": "30:C9:22:B0:D4:2C",
      "prefix": "c4004_0",
      "mqttTopicPrefix": "c4004_0",
      "mqttKey": "main",
      "name": "c4004_0",
      "deploymentName": "厨房",
      "model": "esp32dev",
      "manufacturer": "Espressif",
      "firmwareVersion": "2026.6.4 (2026-07-08 13:29:17 +0800)",
      "installInfo": {
        "installMode": "side",
        "installAngleDeg": 0,
        "installHeightM": 1.8
      },
      "detectionMode": "static_stable",
      "boundAt": "2026-07-08T06:24:50.073Z",
      "updatedAt": "2026-07-08T10:01:40.796Z"
    }
  ]
}中的数据，"detectionMode": "static_stable",这部分数据用数字来代替， 1 - high_sensitivity 2 - static_stable，减少字符串带来性能消耗
另外：关于这个数据的说明，当前端配置为1：也就是高灵敏度模式，这时候实际后端需要逻辑更新的配置为：确认帧数：2，无人时间：5s;
如果前端配置为2：也就是静态稳定模式，这时候实际后端需要逻辑更新的配置为：确认帧数：7，无人时间：30s;
另外，怎么没有设备类型相关的数据？跟我确认处理。

1.3 我觉得所有的/homeassistant/dfrobot_mmwave/<device_id>/device.json，不再使用这个设备文件信息，内容太重复了，其中，现在改用，/homeassistant/dfrobot_mmwave/<device_id>/config.json（设备ID）：来存储设备配置信息（探测范围、区域配置、无人时间、确认帧数等，探测范围模式等与配置设备类型相关的数据）

1.4 特殊接口解析说明：接口文档（README_ENTITY_API.md）
1.4.1 Mqtt 主题API 数据量和数据 相对native api数据更复杂，需要你详细解析详细使用，这些数据都是要传递给前端使用的，你在后端逻辑数据处理时，需要考虑前端会如何使用，如何为前端留接口，给出最好最推荐的项目

1.4.2 数据一些实时数据存在缓存中，还有一些数据存在本地缓存中，例如实时返回轨迹数据、标签区域的信息、运动等，同时设计接口时，还需要考虑如何为前端留接口，给出最好最推荐的方案；

1.4.3 一些不确定的数据放缓存还是放在config.json中，一定要跟我确认；



2.设备识别风险：
一个esp32配置使用多个传感器传感器，设备识别是否有风险，这是的esphome又如如何区分；给出思路和解决方案；
