# Keep kotlinx.serialization
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keepclassmembers class kotlinx.serialization.json.** {
    *** Companion;
}
-keepclasseswithmembers class kotlinx.serialization.json.** {
    kotlinx.serialization.KSerializer serializer(...);
}

-keep,includedescriptorclasses class com.naufal.chatbot.**$$serializer { *; }
-keepclassmembers class com.naufal.chatbot.** {
    *** Companion;
}
-keepclasseswithmembers class com.naufal.chatbot.** {
    kotlinx.serialization.KSerializer serializer(...);
}