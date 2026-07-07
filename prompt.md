# Reference
接口相关：（设备到传感器侧）
    （传感器+固件）侧接口参考使用：05_Software\home_assistant\Home_Assistant_C4004\Home_Assistant_C4004\README_ENTITY_API.md；
    （传感器+固件）如果接口方面有不明确的，就参考05_Software\home_assistant\Home_Assistant_C4004\Home_Assistant_C4004\dfrobot_c4004；
log相关:
    app log：01_Reference\log\app_log.svg（共APP图标使用）
    app内部可以展示log：01_Reference\log\DFRobot Logo-18.svg

参考工程：01_Reference\everything-presence-addons

项目构造参考：https://developers.home-assistant.io/docs/apps/tutorial

# 开发需求




## 详细需求描述：
### 界面三大部分（设备总览、设备管理、区域管理）

1.1、设备总览（已经开发，不用管，你也不用开发）
设备总览界面风格和界面参考，其中有红色字体做了区域标识说明了那部分什么内容或怎么修改；
参考路径为05_Software\home_assistant\mmWave_addons\resource\设备总览界面.png；
这个界面主界面顶部要展示总设备数、当前总人数、当前探测总人数、当前静止总人数；
下面展示实时设备监控矩阵，最右侧按钮全"添加设备",点击添加设备可跳转只设备管理界面；
下面就是各个设备的展示，展示二维坐标系，在坐标系中，传感器的探测方向朝上，传感器在最中间，固定坐标系的范围为x(-5-5m),y范围为（0-9m），除了显示坐标系之外，还有展示区域标签，探测范围框（这些是坐标系上要显示的内容），注意大小，因为要展示多个设备，这个大小尽可能固定，除此之外，点击这个设备，可以跳转至对应的设备数据(2.1.1)详情展示子界面设备；传感器图标：参考05_Software\home_assistant\mmWave_addons\resource\sensor.png，需要注意这是个wifi的探图案，注意它的方向代表传感器的方向；
2.1.1 设备详情展示主界面（风格参考：05_Software\home_assistant\mmWave_addons\resource\设备详情展示界面.png）
顶部显示设备名称、设备id、在线状态；右侧需要三个按钮重启设备、刷新、区域配置（点击这个按钮就跳到对应得设备得区域管理中）
下方：左侧显示坐标系（这立要显示得尽量大一点合适就行）。显示大小x(-5-5m),y范围为（0-9m），注意，这个也需要展示标签区域、探测范围、；右侧为显示区：运动人数、静止人数、IO联动状态显示IO1（整体区域IO是否触发）- 显示灯    IO2 - 显示灯  IO3 - 显示灯    IO4 - 显示灯   IO5 - 显示灯 IO6- 显示灯；基础信息展示区：安装方式、实时人数上报时间、安装高度、轨迹产生米数、探测模式、轨迹存在时间、确认帧数、无人时间；

2.2、设备管理
做个空界面保留。

2.3、区域管理
做个空界面保留。
