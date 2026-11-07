// Sudoless CPU/GPU clock residency through IOReport (as macmon does). ./freq <seconds> [list]
#include <CoreFoundation/CoreFoundation.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>
typedef struct IOReportSubscriptionRef *IOReportSubscriptionRef;
typedef CFDictionaryRef IOReportSampleRef;
extern CFDictionaryRef IOReportCopyChannelsInGroup(CFStringRef, CFStringRef, uint64_t, uint64_t, uint64_t);
extern void IOReportMergeChannels(CFDictionaryRef, CFDictionaryRef, CFTypeRef);
extern IOReportSubscriptionRef IOReportCreateSubscription(void *, CFMutableDictionaryRef, CFMutableDictionaryRef *, uint64_t, CFTypeRef);
extern CFDictionaryRef IOReportCreateSamples(IOReportSubscriptionRef, CFMutableDictionaryRef, CFTypeRef);
extern CFDictionaryRef IOReportCreateSamplesDelta(CFDictionaryRef, CFDictionaryRef, CFTypeRef);
extern CFStringRef IOReportChannelGetGroup(CFDictionaryRef);
extern CFStringRef IOReportChannelGetSubGroup(CFDictionaryRef);
extern CFStringRef IOReportChannelGetChannelName(CFDictionaryRef);
extern int IOReportStateGetCount(CFDictionaryRef);
extern CFStringRef IOReportStateGetNameForIndex(CFDictionaryRef, int);
extern int64_t IOReportStateGetResidency(CFDictionaryRef, int);
static void str(CFStringRef s, char *b, int n) { b[0] = 0; if (s) CFStringGetCString(s, b, n, kCFStringEncodingUTF8); }
int main(int argc, char **argv) {
  double secs = argc > 1 ? atof(argv[1]) : 2; int list = argc > 2;
  CFDictionaryRef g = IOReportCopyChannelsInGroup(CFSTR("GPU Stats"), CFSTR("GPU Performance States"), 0, 0, 0);
  CFDictionaryRef c = IOReportCopyChannelsInGroup(CFSTR("CPU Stats"), CFSTR("CPU Complex Performance States"), 0, 0, 0);
  CFMutableDictionaryRef ch = CFDictionaryCreateMutableCopy(NULL, 0, g); IOReportMergeChannels(ch, c, NULL);
  CFMutableDictionaryRef sub = NULL; IOReportSubscriptionRef s = IOReportCreateSubscription(NULL, ch, &sub, 0, NULL);
  CFDictionaryRef a = IOReportCreateSamples(s, sub, NULL); usleep((useconds_t)(secs * 1e6)); CFDictionaryRef b = IOReportCreateSamples(s, sub, NULL);
  CFDictionaryRef d = IOReportCreateSamplesDelta(a, b, NULL);
  CFArrayRef arr = CFDictionaryGetValue(d, CFSTR("IOReportChannels"));
  for (CFIndex i = 0; i < CFArrayGetCount(arr); i++) {
    CFDictionaryRef x = CFArrayGetValueAtIndex(arr, i); char gr[64], sg[64], nm[64]; str(IOReportChannelGetGroup(x), gr, 64); str(IOReportChannelGetSubGroup(x), sg, 64); str(IOReportChannelGetChannelName(x), nm, 64);
    int n = IOReportStateGetCount(x); printf("%s|%s|%s", gr, sg, nm);
    for (int k = 0; k < n; k++) { char sn[32]; str(IOReportStateGetNameForIndex(x, k), sn, 32); printf(" %s=%lld", sn, (long long)IOReportStateGetResidency(x, k)); }
    printf("\n");
  }
  return 0;
}
