# Reference
接口相关：（设备到传感器侧）
    （传感器+固件）侧接口参考使用：05_Software\home_assistant\Home_Assistant_C4004\Home_Assistant_C4004\README_ENTITY_API.md；
    （传感器+固件）如果接口方面有不明确的，就参考05_Software\home_assistant\Home_Assistant_C4004\Home_Assistant_C4004\dfrobot_c4004；

前端涉及的资源和工程路径：C:\Users\32731\Desktop\mmwave\crr_ui\；其中包含一些图片例如svg文件，我已经帮我你迁移过来了05_Software\home_assistant\mmWave_addons\dfrobot_mmWave\frontend\resource

接口资源说明文档：D:\User\lj\DFRobot\Project\module\C4004\C4004\05_Software\home_assistant\mmWave_addons\dfrobot_mmWave\backend\README_API.md


# 开发需求
我的前端重有两个界面重新做了一下C:\Users\32731\Desktop\mmwave\crr_ui\index.html；主要是设备管理和区域管理界面；因为布局我采用了html文件，我需要你直接帮我迁移搬过来，不只是界面布局、还有交互方式和逻辑等；
如果你有不确定的一定要先跟我确定；

## 特别需求特别说明：
1. 在底图设置的过程中，涉及图片导入和导出、导入图片后，你需要放在dfrobot_mmWave\frontend\resource\base_map\user这个路径下；然后我作为官方添加一下默认的底图，在这个路径下05_Software\home_assistant\mmWave_addons\dfrobot_mmWave\frontend\resource\base_map\system；

2.其它的导出导入文件，先不做具体实现；

3.其它就先移植过来；另外，一定会有一部分数据你可以进行对接了，能直接对接的先对接了，我等会直接进行测试