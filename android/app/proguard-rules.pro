# ProGuard rules for Chrono Mohammedia
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod

# Gson rules
-keepclassmembers,allowobfuscation class * {
    @com.google.gson.annotations.SerializedName <fields>;
}
-keep class com.chrono.mohammedia.data.model.** { *; }

# Retrofit rules
-dontwarn retrofit2.**
-keep class retrofit2.** { *; }
-keepattributes Exceptions
